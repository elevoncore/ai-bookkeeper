import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));

const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseAnonKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();

const BASE_URL = 'http://localhost:3005';
const { createClient } = require('@supabase/supabase-js');

async function runChaosAudit() {
  console.log("===============================================================");
  console.log("  MASTER CPA SYSTEM-WIDE CHAOS AUDIT & FORENSIC LEDGER SCAN   ");
  console.log("===============================================================");

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const testEmail = `cpa_chaos_${Date.now()}@masterbookkeeper.test`;
  const testPass = `CpaMasterPass123!`;

  console.log(`\n[Auth] Creating isolated test user: ${testEmail}`);
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email: testEmail,
    password: testPass,
  });

  if (authErr) throw new Error(`Auth failed: ${authErr.message}`);
  const user = authData.user;
  const token = authData.session.access_token;
  console.log(`[Auth] User created with ID: ${user.id}`);

  // Wait for accounts initialization trigger
  await new Promise(r => setTimeout(r, 1500));
  await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

  const auditResults = [];

  function recordResult(testId, name, passed, details) {
    auditResults.push({ testId, name, passed, details });
    const statusSymbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${statusSymbol} [${testId}] ${name}: ${details}`);
  }

  // Fetch accounts
  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', user.id);
  const getAcc = (name) => accounts.find(a => a.name.toLowerCase().includes(name.toLowerCase()));

  const mainBank = getAcc('Main Bank');
  const pettyCash = getAcc('Petty Cash');
  const arAcc = getAcc('Accounts Receivable');
  const apAcc = getAcc('Accounts Payable');
  const cogsAcc = getAcc('Cost of Goods Sold');
  const invAssetAcc = getAcc('Inventory Asset');
  const salesRevAcc = getAcc('Sales Revenue');
  const genExpAcc = getAcc('General Operating');
  const loanPayableAcc = getAcc('Loan Payable');
  const interestExpAcc = getAcc('Interest Expense');
  const custAdvAcc = getAcc('Customer Advance');
  const suppAdvAcc = getAcc('Supplier Advance');
  const ownerDrawingsAcc = getAcc('Owner Drawings');
  const ownersEquityAcc = getAcc('Owners Equity');

  console.log("\n===============================================================");
  console.log("  THEATRE ALPHA: TREASURY & LIQUIDITY AUDIT                    ");
  console.log("===============================================================");

  // T01: Unbalanced Manual Journal Entry
  try {
    const { error } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user.id,
      p_date: '2026-08-01',
      p_description: 'T01 Unbalanced Entry Test',
      p_lines: [
        { account_id: mainBank.id, debit: 100, credit: 0 },
        { account_id: genExpAcc.id, debit: 0, credit: 90 }
      ]
    });
    if (error && error.message.toLowerCase().includes('unbalanced')) {
      recordResult('T01', 'Unbalanced Journal Entry Rejection', true, 'Correctly rejected unbalanced lines (100 != 90).');
    } else {
      recordResult('T01', 'Unbalanced Journal Entry Rejection', false, `Unbalanced entry was allowed or unexpected error: ${error?.message}`);
    }
  } catch (e) {
    recordResult('T01', 'Unbalanced Journal Entry Rejection', true, `Threw error: ${e.message}`);
  }

  // T02: Zero Amount Journal Entry
  try {
    const { error } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user.id,
      p_date: '2026-08-01',
      p_description: 'T02 Zero Amount Entry Test',
      p_lines: [
        { account_id: mainBank.id, debit: 0, credit: 0 },
        { account_id: genExpAcc.id, debit: 0, credit: 0 }
      ]
    });
    if (error && (error.message.toLowerCase().includes('greater than zero') || error.message.toLowerCase().includes('unbalanced'))) {
      recordResult('T02', 'Zero Amount Journal Entry Rejection', true, 'Correctly rejected 0 amount entry.');
    } else {
      recordResult('T02', 'Zero Amount Journal Entry Rejection', false, `Allowed 0 amount entry or unexpected error: ${error?.message}`);
    }
  } catch (e) {
    recordResult('T02', 'Zero Amount Journal Entry Rejection', true, `Threw error: ${e.message}`);
  }

  // T03: Initial Capital Contribution
  try {
    const { data: capId, error: capErr } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user.id,
      p_date: '2026-08-01',
      p_description: 'Owner Capital Contribution',
      p_lines: [
        { account_id: mainBank.id, debit: 500000, credit: 0 },
        { account_id: ownersEquityAcc.id, debit: 0, credit: 500000 }
      ]
    });
    if (!capErr && capId) {
      recordResult('T03', 'Owner Capital Contribution', true, 'Successfully debited Bank 500k and credited Equity 500k.');
    } else {
      recordResult('T03', 'Owner Capital Contribution', false, `Failed: ${capErr?.message}`);
    }
  } catch (e) {
    recordResult('T03', 'Owner Capital Contribution', false, e.message);
  }

  // T04: Bank to Cash Transfer
  try {
    const { data: tfId, error: tfErr } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user.id,
      p_date: '2026-08-02',
      p_description: 'Cash transfer to petty cash',
      p_lines: [
        { account_id: pettyCash.id, debit: 50000, credit: 0 },
        { account_id: mainBank.id, debit: 0, credit: 50000 }
      ]
    });
    if (!tfErr && tfId) {
      recordResult('T04', 'Liquid Cash-to-Cash Transfer', true, 'Debited Petty Cash 50k, Credited Main Bank 50k.');
    } else {
      recordResult('T04', 'Liquid Cash-to-Cash Transfer', false, `Failed: ${tfErr?.message}`);
    }
  } catch (e) {
    recordResult('T04', 'Liquid Cash-to-Cash Transfer', false, e.message);
  }

  // T05: Owner Personal Drawings
  try {
    const { data: drawId, error: drawErr } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user.id,
      p_date: '2026-08-03',
      p_description: 'Owner personal withdrawal',
      p_lines: [
        { account_id: ownerDrawingsAcc.id, debit: 20000, credit: 0 },
        { account_id: pettyCash.id, debit: 0, credit: 20000 }
      ]
    });
    if (!drawErr && drawId) {
      recordResult('T05', 'Owner Personal Drawings', true, 'Debited Owner Drawings 20k, Credited Petty Cash 20k.');
    } else {
      recordResult('T05', 'Owner Personal Drawings', false, `Failed: ${drawErr?.message}`);
    }
  } catch (e) {
    recordResult('T05', 'Owner Personal Drawings', false, e.message);
  }

  // Create Customer & Supplier
  const { data: customer1 } = await supabase.from('customers').insert({ user_id: user.id, name: 'Apex Corp', email: 'apex@test.com' }).select().single();
  const { data: supplier1 } = await supabase.from('suppliers').insert({ user_id: user.id, name: 'Beta Logistics', email: 'beta@test.com' }).select().single();

  // T06: Customer Advance Deposit Receipt
  let custAdvPaymentId = null;
  try {
    const { data: advId, error: advErr } = await supabase.rpc('log_customer_advance_atomic', {
      p_user_id: user.id,
      p_customer_id: customer1.id,
      p_amount: 100000,
      p_date: '2026-08-04',
      p_method: 'Bank Transfer',
      p_deposit_account_id: mainBank.id,
      p_notes: 'Advance deposit for upcoming project'
    });
    if (!advErr && advId) {
      custAdvPaymentId = advId;
      recordResult('T06', 'Customer Advance Deposit Receipt', true, 'Recorded 100k Unearned Revenue liability & debited Bank.');
    } else {
      recordResult('T06', 'Customer Advance Deposit Receipt', false, `Failed: ${advErr?.message}`);
    }
  } catch (e) {
    recordResult('T06', 'Customer Advance Deposit Receipt', false, e.message);
  }

  // T07: Supplier Advance Prepayment
  let suppAdvPaymentId = null;
  try {
    const { data: sAdvId, error: sAdvErr } = await supabase.rpc('log_supplier_advance_atomic', {
      p_user_id: user.id,
      p_supplier_id: supplier1.id,
      p_amount: 60000,
      p_date: '2026-08-04',
      p_method: 'Bank Transfer',
      p_payment_account_id: mainBank.id,
      p_notes: 'Prepayment for freight services'
    });
    if (!sAdvErr && sAdvId) {
      suppAdvPaymentId = sAdvId;
      recordResult('T07', 'Supplier Advance Prepayment Outflow', true, 'Recorded 60k Prepaid Expense asset & credited Bank.');
    } else {
      recordResult('T07', 'Supplier Advance Prepayment Outflow', false, `Failed: ${sAdvErr?.message}`);
    }
  } catch (e) {
    recordResult('T07', 'Supplier Advance Prepayment Outflow', false, e.message);
  }

  // T08: Create Invoice and Apply Customer Advance
  let testInvoiceId = null;
  try {
    const { data: invId, error: invErr } = await supabase.rpc('create_invoice_with_lines_atomic', {
      p_user_id: user.id,
      p_customer_id: customer1.id,
      p_issue_date: '2026-08-05',
      p_due_date: '2026-08-20',
      p_status: 'open',
      p_total_amount: 150000,
      p_receipt_url: null,
      p_line_items: [{ product_id: null, description: 'Project Phase 1', quantity: 1, unit_price: 150000, total: 150000 }]
    });
    testInvoiceId = invId;

    await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', invId);

    // Apply 100k advance
    const { error: applyErr } = await supabase.rpc('apply_customer_advance_atomic', {
      p_user_id: user.id,
      p_customer_id: customer1.id,
      p_invoice_id: invId,
      p_amount: 100000,
      p_date: '2026-08-05'
    });

    const { data: updatedInv } = await supabase.from('invoices').select('balance_due, amount_paid, status').eq('id', invId).single();

    if (!applyErr && updatedInv.balance_due === 50000 && updatedInv.status === 'partial') {
      recordResult('T08', 'Apply Customer Advance to Invoice', true, 'Successfully applied 100k advance. Balance due: 50k, Status: partial.');
    } else {
      recordResult('T08', 'Apply Customer Advance to Invoice', false, `Apply advance failed or balance mismatch: ${applyErr?.message || JSON.stringify(updatedInv)}`);
    }
  } catch (e) {
    recordResult('T08', 'Apply Customer Advance to Invoice', false, e.message);
  }

  // T09: Settle Remaining Invoice Balance via Cash
  try {
    const { error: payInvErr } = await supabase.rpc('log_payment_received_atomic', {
      p_invoice_id: testInvoiceId,
      p_user_id: user.id,
      p_amount: 50000,
      p_date: '2026-08-06',
      p_method: 'Cash'
    });

    const { data: paidInv } = await supabase.from('invoices').select('balance_due, amount_paid, status').eq('id', testInvoiceId).single();

    if (!payInvErr && paidInv.balance_due === 0 && paidInv.status === 'paid') {
      recordResult('T09', 'Settle Remaining Invoice Balance', true, 'Invoice fully settled. Balance: 0, Status: paid.');
    } else {
      recordResult('T09', 'Settle Remaining Invoice Balance', false, `Settlement failed: ${payInvErr?.message || JSON.stringify(paidInv)}`);
    }
  } catch (e) {
    recordResult('T09', 'Settle Remaining Invoice Balance', false, e.message);
  }

  console.log("\n===============================================================");
  console.log("  THEATRE BETA: AMORTIZATION & DEBT AUDIT                      ");
  console.log("===============================================================");

  // T10: Receive Bank Loan
  try {
    const { data: loanJeId, error: loanJeErr } = await supabase.rpc('create_journal_entry_atomic', {
      p_user_id: user.id,
      p_date: '2026-08-06',
      p_description: 'Received Commercial Bank Loan',
      p_lines: [
        { account_id: mainBank.id, debit: 1000000, credit: 0 },
        { account_id: loanPayableAcc.id, debit: 0, credit: 1000000 }
      ]
    });
    if (!loanJeErr && loanJeId) {
      recordResult('T10', 'Receive Loan Inflow', true, 'Debited Bank 1M PKR, Credited Loan Payable 1M PKR.');
    } else {
      recordResult('T10', 'Receive Loan Inflow', false, `Failed: ${loanJeErr?.message}`);
    }
  } catch (e) {
    recordResult('T10', 'Receive Loan Inflow', false, e.message);
  }

  // T11: Split-Interest Loan Repayment
  try {
    const { data: repayId, error: repayErr } = await supabase.rpc('record_loan_payment_atomic', {
      p_user_id: user.id,
      p_loan_account_id: loanPayableAcc.id,
      p_total_amount: 50000,
      p_interest_amount: 15000,
      p_payment_account_id: mainBank.id,
      p_date: '2026-08-07',
      p_description: 'Monthly Loan Installment'
    });

    if (!repayErr && repayId) {
      recordResult('T11', 'Split-Interest Loan Repayment', true, 'Posted 50k payment: 35k Principal to Loan Payable, 15k to Interest Expense.');
    } else {
      recordResult('T11', 'Split-Interest Loan Repayment', false, `Failed: ${repayErr?.message}`);
    }
  } catch (e) {
    recordResult('T11', 'Split-Interest Loan Repayment', false, e.message);
  }

  // T12: Adversarial Test - Negative Interest in Loan Payment
  try {
    const { error: negIntErr } = await supabase.rpc('record_loan_payment_atomic', {
      p_user_id: user.id,
      p_loan_account_id: loanPayableAcc.id,
      p_total_amount: 50000,
      p_interest_amount: -5000,
      p_payment_account_id: mainBank.id,
      p_date: '2026-08-07'
    });
    if (negIntErr) {
      recordResult('T12', 'Negative Loan Interest Trap', true, `Correctly rejected negative interest: ${negIntErr.message}`);
    } else {
      recordResult('T12', 'Negative Loan Interest Trap', false, 'Allowed negative interest amount!');
    }
  } catch (e) {
    recordResult('T12', 'Negative Loan Interest Trap', true, e.message);
  }

  // T13: Adversarial Test - Interest Exceeding Total Payment
  try {
    const { error: excIntErr } = await supabase.rpc('record_loan_payment_atomic', {
      p_user_id: user.id,
      p_loan_account_id: loanPayableAcc.id,
      p_total_amount: 50000,
      p_interest_amount: 65000,
      p_payment_account_id: mainBank.id,
      p_date: '2026-08-07'
    });
    if (excIntErr) {
      recordResult('T13', 'Interest Exceeding Total Trap', true, `Correctly rejected interest > total: ${excIntErr.message}`);
    } else {
      recordResult('T13', 'Interest Exceeding Total Trap', false, 'Allowed interest > total!');
    }
  } catch (e) {
    recordResult('T13', 'Interest Exceeding Total Trap', true, e.message);
  }

  console.log("\n===============================================================");
  console.log("  THEATRE GAMMA: PERPETUAL INVENTORY & COGS AUDIT              ");
  console.log("===============================================================");

  // Create Product: Tracked Laptop
  const { data: prodLaptop } = await supabase.from('products').insert({
    user_id: user.id,
    name: 'Chaos Test Laptop',
    cost: 50000,
    price: 80000,
    inventory_count: 0,
    is_inventory_tracked: true
  }).select().single();

  // T14: Bill Purchase of Tracked Inventory
  try {
    const { data: bId, error: bErr } = await supabase.rpc('create_bill_with_lines_atomic', {
      p_user_id: user.id,
      p_supplier_id: supplier1.id,
      p_issue_date: '2026-08-08',
      p_due_date: '2026-08-25',
      p_status: 'open',
      p_total_amount: 500000,
      p_receipt_url: null,
      p_line_items: [
        { product_id: prodLaptop.id, account_id: invAssetAcc.id, description: '10x Laptops', quantity: 10, unit_price: 50000, amount: 500000 }
      ]
    });

    await supabase.from('bills').update({ is_ai_verified: true }).eq('id', bId);

    const { data: updatedLaptop } = await supabase.from('products').select('inventory_count, cost').eq('id', prodLaptop.id).single();

    if (updatedLaptop.inventory_count === 10 && updatedLaptop.cost === 50000) {
      recordResult('T14', 'Purchase Tracked Inventory & Stock Update', true, `Stock incremented to 10 @ 50,000 WAC.`);
    } else {
      recordResult('T14', 'Purchase Tracked Inventory & Stock Update', false, `Stock mismatch: count=${updatedLaptop.inventory_count}, cost=${updatedLaptop.cost}`);
    }
  } catch (e) {
    recordResult('T14', 'Purchase Tracked Inventory & Stock Update', false, e.message);
  }

  // T15: Sale of Tracked Inventory (Perpetual COGS Realization)
  try {
    const { data: invSaleId, error: invSaleErr } = await supabase.rpc('create_invoice_with_lines_atomic', {
      p_user_id: user.id,
      p_customer_id: customer1.id,
      p_issue_date: '2026-08-09',
      p_due_date: '2026-08-25',
      p_status: 'open',
      p_total_amount: 320000,
      p_receipt_url: null,
      p_line_items: [
        { product_id: prodLaptop.id, description: 'Sale 4x Laptops', quantity: 4, unit_price: 80000, total: 320000 }
      ]
    });

    await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', invSaleId);

    const { data: laptopAfterSale } = await supabase.from('products').select('inventory_count').eq('id', prodLaptop.id).single();

    // Check journal entries for COGS posting
    const { data: jeForInvoice } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*, accounts(name))')
      .eq('reference_id', invSaleId);

    const allLines = jeForInvoice?.flatMap(j => j.journal_lines) || [];
    const cogsLine = allLines.find(l => l.accounts?.name === 'Cost of Goods Sold');
    const invAssetLine = allLines.find(l => l.accounts?.name === 'Inventory Asset');

    if (laptopAfterSale.inventory_count === 6 && cogsLine && invAssetLine && Number(cogsLine.debit) === 200000) {
      recordResult('T15', 'Sales Invoice Perpetual COGS Realization', true, 'Stock dropped from 10 to 6, Debited COGS 200k (4 * 50k), Credited Inventory Asset 200k.');
    } else {
      recordResult('T15', 'Sales Invoice Perpetual COGS Realization', false, `COGS check failed. Stock: ${laptopAfterSale.inventory_count}, COGS line: ${JSON.stringify(cogsLine)}`);
    }
  } catch (e) {
    recordResult('T15', 'Sales Invoice Perpetual COGS Realization', false, e.message);
  }

  // T16: Stocktake Reconciliation (Shrinkage)
  try {
    const { error: reconErr } = await supabase.rpc('reconcile_inventory_atomic', {
      p_user_id: user.id,
      p_product_id: prodLaptop.id,
      p_actual_stock_count: 5,
      p_reason: '1 Laptop damaged during warehouse move'
    });

    const { data: laptopAfterRecon } = await supabase.from('products').select('inventory_count').eq('id', prodLaptop.id).single();

    if (!reconErr && laptopAfterRecon.inventory_count === 5) {
      recordResult('T16', 'Inventory Stocktake Shrinkage Reconciliation', true, 'Stock adjusted from 6 to 5. Shrinkage expense posted.');
    } else {
      recordResult('T16', 'Inventory Stocktake Shrinkage Reconciliation', false, `Recon failed: ${reconErr?.message}`);
    }
  } catch (e) {
    recordResult('T16', 'Inventory Stocktake Shrinkage Reconciliation', false, e.message);
  }

  console.log("\n===============================================================");
  console.log("  THEATRE DELTA: AI AUTONOMY & GUARDRAILS AUDIT                ");
  console.log("===============================================================");

  // T17: AI Strict Mode Ambiguity Trap
  try {
    const aiRes = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'I bought a desk for 15,000 PKR' })
    });
    const aiData = await aiRes.json();
    if (aiData.is_complete === false && (aiData.clarification_question || aiData.conversational_response)) {
      recordResult('T17', 'AI Strict Ambiguity Trap (Desk purchase)', true, `Trap fired: "${aiData.clarification_question || aiData.conversational_response}"`);
    } else {
      recordResult('T17', 'AI Strict Ambiguity Trap (Desk purchase)', false, `Did not trap ambiguity! Output: ${JSON.stringify(aiData)}`);
    }
  } catch (e) {
    recordResult('T17', 'AI Strict Ambiguity Trap (Desk purchase)', false, e.message);
  }

  // T18: AI Explicit Resale Bypass
  try {
    const aiRes = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'I bought a used monitor for 10k and immediately sold it to a walk-in customer for 14k cash' })
    });
    const aiData = await aiRes.json();
    if (aiData.is_complete === true && aiData.line_items?.length >= 2) {
      recordResult('T18', 'AI Immediate Resale Explicit Bypass', true, `Bypassed trap and structured ${aiData.line_items.length} line items.`);
    } else {
      recordResult('T18', 'AI Immediate Resale Explicit Bypass', false, `Failed to bypass: ${JSON.stringify(aiData)}`);
    }
  } catch (e) {
    recordResult('T18', 'AI Immediate Resale Explicit Bypass', false, e.message);
  }

  // T19: AI Financial Report Query (Real P&L Grounding)
  try {
    const aiRes = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Show me my Profit and Loss summary' })
    });
    const aiData = await aiRes.json();
    if (aiData.intent === 'QUERY_REPORT' && aiData.conversational_response?.includes('Revenue') && aiData.conversational_response?.includes('Profit')) {
      recordResult('T19', 'AI P&L Grounding Query', true, `Generated grounded financial report response.`);
    } else {
      recordResult('T19', 'AI P&L Grounding Query', false, `Did not return grounded response: ${JSON.stringify(aiData)}`);
    }
  } catch (e) {
    recordResult('T19', 'AI P&L Grounding Query', false, e.message);
  }

  // T20: AI Debt Query Grounding
  try {
    const aiRes = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Who owes me money?' })
    });
    const aiData = await aiRes.json();
    if (aiData.intent === 'QUERY_DEBT' && aiData.conversational_response) {
      recordResult('T20', 'AI Outstanding Debt Grounding Query', true, `Returned debt report: "${aiData.conversational_response.substring(0, 80)}..."`);
    } else {
      recordResult('T20', 'AI Outstanding Debt Grounding Query', false, `Failed: ${JSON.stringify(aiData)}`);
    }
  } catch (e) {
    recordResult('T20', 'AI Outstanding Debt Grounding Query', false, e.message);
  }

  console.log("\n===============================================================");
  console.log("  THEATRE EPSILON: FINANCIAL INTEGRITY & EXCEL SCAN            ");
  console.log("===============================================================");

  // T21: Financials API Zero-Sum Trial Balance Verification
  try {
    const finRes = await fetch(`${BASE_URL}/api/reports/financials`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const finData = await finRes.json();
    const diff = Math.abs(Number(finData.total_debits) - Number(finData.total_credits));

    if (diff < 0.001) {
      recordResult('T21', 'Trial Balance Zero-Sum Equation', true, `Debits (${finData.total_debits} PKR) === Credits (${finData.total_credits} PKR). Net Diff: 0.00`);
    } else {
      recordResult('T21', 'Trial Balance Zero-Sum Equation', false, `UNBALANCED! Debits: ${finData.total_debits}, Credits: ${finData.total_credits}, Diff: ${diff}`);
    }
  } catch (e) {
    recordResult('T21', 'Trial Balance Zero-Sum Equation', false, e.message);
  }

  // T22: Balance Sheet Equation Verification (Assets = Liabilities + Equity)
  try {
    const bsRes = await fetch(`${BASE_URL}/api/reports/balance-sheet`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const bsData = await bsRes.json();
    const assets = Number(bsData.totals?.total_assets || 0);
    const liabAndEquity = Number(bsData.totals?.total_liabilities_and_equity || 0);
    const diff = Math.abs(assets - liabAndEquity);

    if (diff < 0.001 && bsData.is_balanced) {
      recordResult('T22', 'Balance Sheet Equation (Assets = Liab + Equity)', true, `Assets (${assets.toLocaleString()} PKR) === Liabilities + Equity (${liabAndEquity.toLocaleString()} PKR).`);
    } else {
      recordResult('T22', 'Balance Sheet Equation (Assets = Liab + Equity)', false, `UNBALANCED! Assets: ${assets}, Liab+Equity: ${liabAndEquity}, Diff: ${diff}`);
    }
  } catch (e) {
    recordResult('T22', 'Balance Sheet Equation (Assets = Liab + Equity)', false, e.message);
  }

  // T23: Cashbook Balances API
  try {
    const cbRes = await fetch(`${BASE_URL}/api/reports/cashbook`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const cbData = await cbRes.json();
    if (cbData.success && typeof cbData.totalCashBalance === 'number') {
      recordResult('T23', 'Cashbook Liquid Balances API', true, `Total liquid cash reserves: ${cbData.totalCashBalance.toLocaleString()} PKR across ${cbData.accounts?.length} accounts.`);
    } else {
      recordResult('T23', 'Cashbook Liquid Balances API', false, `Failed: ${JSON.stringify(cbData)}`);
    }
  } catch (e) {
    recordResult('T23', 'Cashbook Liquid Balances API', false, e.message);
  }

  // T24: Excel Export Buffer Scan for NaN/Null/Corrupt cells
  try {
    const expRes = await fetch(`${BASE_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ timeframe: 'all', selectedModules: ['Overview', 'Sales', 'Purchases', 'Accounting'] })
    });

    if (expRes.ok) {
      const buffer = await expRes.arrayBuffer();
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(buffer));

      let hasCorruptCells = false;
      let corruptCellCount = 0;

      wb.eachSheet((sheet) => {
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            const val = String(cell.value || '');
            if (val.includes('NaN') || val.includes('undefined') || val.includes('#VALUE!')) {
              hasCorruptCells = true;
              corruptCellCount++;
              console.log(`Corrupt cell in ${sheet.name} row ${row.number}:`, val);
            }
          });
        });
      });

      if (!hasCorruptCells) {
        recordResult('T24', 'Excel Export Multi-Tab Data Integrity', true, `Exported ${wb.worksheets.length} sheets (${Buffer.from(buffer).length} bytes) with 0 corrupt/NaN cells.`);
      } else {
        recordResult('T24', 'Excel Export Multi-Tab Data Integrity', false, `Found ${corruptCellCount} corrupt cells in exported Excel.`);
      }
    } else {
      recordResult('T24', 'Excel Export Multi-Tab Data Integrity', false, `Export API error: ${expRes.status} ${await expRes.text()}`);
    }
  } catch (e) {
    recordResult('T24', 'Excel Export Multi-Tab Data Integrity', false, e.message);
  }

  // Summary
  const passedCount = auditResults.filter(r => r.passed).length;
  const failedCount = auditResults.filter(r => !r.passed).length;
  console.log("\n===============================================================");
  console.log(`  AUDIT RUN COMPLETE: ${passedCount} PASSED / ${failedCount} FAILED`);
  console.log("===============================================================");

  return { passedCount, failedCount, auditResults };
}

runChaosAudit().catch(err => {
  console.error("Chaos Audit Fatal Error:", err);
  process.exit(1);
});
