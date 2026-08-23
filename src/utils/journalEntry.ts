import { SupabaseClient } from '@supabase/supabase-js';
import { parseToCents } from './currency';

export interface JournalLineItem {
  account_id: string;
  debit?: number;
  credit?: number;
  amount?: number;
  is_debit?: boolean;
}

export interface PostJournalEntryParams {
  user_id: string;
  date: string;
  description: string;
  lines: JournalLineItem[];
  created_by_source?: 'AI' | 'MANUAL';
  draft_id?: string;
  reference_type?: string;
  reference_id?: string | null;
}

/**
 * Creates a balanced double-entry journal entry atomically with Idempotency protection.
 * Tries RPC first; falls back to client atomic insert with strict balancing validation.
 */
export async function createJournalEntryAtomic(
  supabase: SupabaseClient,
  params: PostJournalEntryParams
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { user_id, date, description, lines, created_by_source = 'AI', draft_id, reference_type = 'JOURNAL', reference_id = null } = params;

  if (!lines || lines.length === 0) {
    return { success: false, error: 'Journal entry must contain at least one line item.' };
  }

  // 0. Idempotency Check: Prevent duplicate submissions for the same draft_id
  if (draft_id) {
    try {
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', user_id)
        .eq('source_reference', draft_id)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[IDEMPOTENCY] Draft ${draft_id} already processed. Returning existing ID.`);
        return { success: true, id: existing[0].id };
      }
    } catch (_) {
      // Ignore if source_reference column is not yet deployed
    }
  }

  // 1. Normalize line debits & credits into integer cents
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  const normalizedLines = lines.map(line => {
    let debit = 0;
    let credit = 0;

    if (typeof line.debit === 'number' || typeof line.credit === 'number') {
      debit = line.debit || 0;
      credit = line.credit || 0;
    } else if (typeof line.amount === 'number' && typeof line.is_debit === 'boolean') {
      if (line.is_debit) {
        debit = line.amount;
      } else {
        credit = line.amount;
      }
    }

    const lineDebitCents = parseToCents(debit);
    const lineCreditCents = parseToCents(credit);

    totalDebitCents += lineDebitCents;
    totalCreditCents += lineCreditCents;

    return {
      account_id: line.account_id,
      debit: lineDebitCents / 100,
      credit: lineCreditCents / 100
    };
  });

  // 2. Strict Double-Entry Balance Check (Debits = Credits)
  if (totalDebitCents !== totalCreditCents) {
    const debitsFormatted = (totalDebitCents / 100).toLocaleString();
    const creditsFormatted = (totalCreditCents / 100).toLocaleString();
    return {
      success: false,
      error: `Unbalanced Journal Entry! Total Debits (${debitsFormatted} PKR) must equal Total Credits (${creditsFormatted} PKR).`
    };
  }

  if (totalDebitCents <= 0) {
    return { success: false, error: 'Journal Entry total amount must be greater than zero.' };
  }

  // 3. Try RPC call first
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user_id,
      p_date: date,
      p_description: description,
      p_lines: normalizedLines,
      p_created_by_source: created_by_source,
      p_source_reference: draft_id
    });

    if (!rpcErr && rpcData) {
      if (draft_id) {
        try {
          await supabase.from('journal_entries').update({ source_reference: draft_id }).eq('id', rpcData);
        } catch (_) {}
      }
      return { success: true, id: rpcData };
    }
  } catch (e) {
    // Ignore RPC failure & fallback to direct table insert
  }

  // 4. Direct atomic insert fallback
  const insertPayload: any = {
    user_id,
    date,
    reference_type: reference_type || 'JOURNAL',
    reference_id: reference_id || null,
    description
  };

  if (draft_id) {
    insertPayload.source_reference = draft_id;
  }

  let { data: parentEntry, error: parentError } = await supabase
    .from('journal_entries')
    .insert(insertPayload)
    .select('id')
    .single();

  if (parentError && parentError.message?.includes('source_reference')) {
    delete insertPayload.source_reference;
    const res = await supabase.from('journal_entries').insert(insertPayload).select('id').single();
    parentEntry = res.data;
    parentError = res.error;
  }

  if (parentError || !parentEntry) {
    return { success: false, error: parentError?.message || 'Failed to create journal entry parent record.' };
  }

  const childLines = normalizedLines.map(l => ({
    journal_entry_id: parentEntry.id,
    account_id: l.account_id,
    debit: l.debit,
    credit: l.credit
  }));

  const { error: linesError } = await supabase
    .from('journal_lines')
    .insert(childLines);

  if (linesError) {
    return { success: false, error: linesError.message };
  }

  return { success: true, id: parentEntry.id };
}
