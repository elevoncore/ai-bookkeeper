const fs = require('fs');

const coaPath = 'd:/build/ai-bookkeeper/src/components/dashboard/ChartOfAccountsManager.tsx';
let content = fs.readFileSync(coaPath, 'utf8');

// 1. Add states
content = content.replace(
  "  const [isCashAccount, setIsCashAccount] = useState(false);\n  const [isSubmitting, setIsSubmitting] = useState(false);",
  "  const [isCashAccount, setIsCashAccount] = useState(false);\n  const [newParentAccountId, setNewParentAccountId] = useState('');\n  const [isSubmitting, setIsSubmitting] = useState(false);"
);

content = content.replace(
  "  const [editIsCash, setEditIsCash] = useState(false);\n  const [isEditSubmitting, setIsEditSubmitting] = useState(false);",
  "  const [editIsCash, setEditIsCash] = useState(false);\n  const [editParentAccountId, setEditParentAccountId] = useState('');\n  const [isEditSubmitting, setIsEditSubmitting] = useState(false);"
);

// 2. Update handleCreateAccount
const targetCreateHandler = `  async function handleCreateAccount(e: React.FormEvent) {
  e.preventDefault();
  if (!newAccountName.trim()) {
  toast.error("Account name is required.");
  return;
  }

  setIsSubmitting(true);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
  toast.error("User session not found.");
  setIsSubmitting(false);
  return;
  }

  let insertData: any = {
  user_id: user.id,
  name: newAccountName.trim(),
  type: newAccountType,
  is_system: false
  };

  if (newAccountCode.trim()) {
  insertData.code = newAccountCode.trim();
  }
  if (newAccountType === 'asset' && isCashAccount) {
  insertData.is_cash_account = true;
  }

  let { error: insertError } = await supabase.from('accounts').insert(insertData);

  // Fallback if optional schema columns (code, is_cash_account) do not exist in DB
  if (insertError && (insertError.message?.includes('code') || insertError.message?.includes('is_cash_account'))) {
  delete insertData.code;
  delete insertData.is_cash_account;
  const res = await supabase.from('accounts').insert(insertData);
  insertError = res.error;
  }

  if (insertError) {
  console.error("Failed to insert account:", insertError);
  toast.error(\`Failed to create account: \${insertError.message}\`);
  setIsSubmitting(false);
  return;
  }

  toast.success(\`Account "\${newAccountName.trim()}" created successfully!\`);
  setNewAccountName('');
  setNewAccountCode('');
  setNewAccountType('asset');
  setIsCashAccount(false);
  setIsModalOpen(false);
  setIsSubmitting(false);

  await fetchAccountsWithBalances();
  }`;

const replacementCreateHandler = `  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountName.trim()) {
      toast.error("Account name is required.");
      return;
    }

    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("User session not found.");
      setIsSubmitting(false);
      return;
    }

    let insertData: any = {
      user_id: user.id,
      name: newAccountName.trim(),
      type: newAccountType,
      is_system: false,
      is_cash_account: newAccountType === 'asset' && isCashAccount
    };

    if (newAccountCode.trim()) {
      insertData.code = newAccountCode.trim();
    }
    if (newParentAccountId) {
      insertData.parent_account_id = newParentAccountId;
      insertData.parent_id = newParentAccountId;
    }

    let { error: insertError } = await supabase.from('accounts').insert(insertData);

    if (insertError && (insertError.message?.includes('code') || insertError.message?.includes('is_cash_account') || insertError.message?.includes('parent_account_id'))) {
      delete insertData.code;
      delete insertData.parent_account_id;
      const res = await supabase.from('accounts').insert(insertData);
      insertError = res.error;
    }

    if (insertError) {
      console.error("Failed to insert account:", insertError);
      toast.error(\`Failed to create account: \${insertError.message}\`);
      setIsSubmitting(false);
      return;
    }

    toast.success(\`Account "\${newAccountName.trim()}" created successfully!\`);
    setNewAccountName('');
    setNewAccountCode('');
    setNewAccountType('asset');
    setIsCashAccount(false);
    setNewParentAccountId('');
    setIsModalOpen(false);
    setIsSubmitting(false);

    await fetchAccountsWithBalances();
  }`;

content = content.replace(targetCreateHandler, replacementCreateHandler);

// 3. Update openEditModal and handleUpdateAccount
const targetEditHandler = `  function openEditModal(acc: AccountRow) {
  setEditingAccount(acc);
  setEditName(acc.name);
  setEditCode(acc.code || '');
  setEditType(acc.type);
  setEditIsCash(Boolean(acc.is_cash_account));
  }

  async function handleUpdateAccount(e: React.FormEvent) {
  e.preventDefault();
  if (!editingAccount) return;
  if (!editName.trim()) return toast.error("Account name cannot be empty.");

  setIsEditSubmitting(true);
  let updatePayload: any = {
  name: editName.trim(),
  type: editType
  };

  if (editCode.trim()) {
  updatePayload.code = editCode.trim();
  }
  if (editType === 'asset' && editIsCash) {
  updatePayload.is_cash_account = true;
  }

  let { error: updateErr } = await supabase
  .from('accounts')
  .update(updatePayload)
  .eq('id', editingAccount.id);

  if (updateErr && (updateErr.message?.includes('code') || updateErr.message?.includes('is_cash_account'))) {
  delete updatePayload.code;
  delete updatePayload.is_cash_account;
  const res = await supabase.from('accounts').update(updatePayload).eq('id', editingAccount.id);
  updateErr = res.error;
  }

  if (updateErr) {
  toast.error(\`Failed to update account: \${updateErr.message}\`);
  setIsEditSubmitting(false);
  return;
  }

  toast.success(\`Account updated successfully!\`);
  setEditingAccount(null);
  setIsEditSubmitting(false);
  await fetchAccountsWithBalances();
  }`;

const replacementEditHandler = `  function openEditModal(acc: AccountRow) {
    setEditingAccount(acc);
    setEditName(acc.name);
    setEditCode(acc.code || '');
    setEditType(acc.type);
    setEditIsCash(acc.type === 'asset' && Boolean(acc.is_cash_account));
    setEditParentAccountId(acc.parent_account_id || acc.parent_id || '');
  }

  async function handleUpdateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    if (!editName.trim()) return toast.error("Account name cannot be empty.");

    setIsEditSubmitting(true);
    let updatePayload: any = {
      name: editName.trim(),
      type: editType,
      is_cash_account: editType === 'asset' && editIsCash,
      parent_account_id: editParentAccountId || null,
      parent_id: editParentAccountId || null
    };

    if (editCode.trim()) {
      updatePayload.code = editCode.trim();
    }

    let { error: updateErr } = await supabase
      .from('accounts')
      .update(updatePayload)
      .eq('id', editingAccount.id);

    if (updateErr && (updateErr.message?.includes('code') || updateErr.message?.includes('is_cash_account') || updateErr.message?.includes('parent_account_id'))) {
      delete updatePayload.code;
      delete updatePayload.parent_account_id;
      const res = await supabase.from('accounts').update(updatePayload).eq('id', editingAccount.id);
      updateErr = res.error;
    }

    if (updateErr) {
      toast.error(\`Failed to update account: \${updateErr.message}\`);
      setIsEditSubmitting(false);
      return;
    }

    toast.success(\`Account updated successfully!\`);
    setEditingAccount(null);
    setIsEditSubmitting(false);
    await fetchAccountsWithBalances();
  }`;

content = content.replace(targetEditHandler, replacementEditHandler);

// 4. In Create Account Form: add Parent Account select
const targetPresets = `  {newAccountType === 'liability' && (
    <div className="p-3.5 mt-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2">
      <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider block">
        Quick Loan / Liability Sub-Account Presets
      </span>
      <div className="flex flex-wrap gap-1.5">
        {[
          { name: 'Loan - HBL Bank', code: '2520' },
          { name: 'Loan - Meezan Bank', code: '2530' },
          { name: 'Vehicle Loan Payable', code: '2540' },
          { name: 'Short-Term Credit Facility', code: '2550' }
        ].map(preset => (
          <button
            key={preset.name}
            type="button"
            onClick={() => {
              setNewAccountName(preset.name);
              setNewAccountCode(preset.code);
            }}
            className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-amber-100 hover:text-amber-900 border border-amber-200 rounded-lg text-amber-800 transition-colors shadow-2xs cursor-pointer"
          >
            + {preset.name}
          </button>
        ))}
      </div>
    </div>
  )}`;

const replacementPresets = `  {(newAccountType === 'liability' || newAccountType === 'asset') && (
    <div className="mt-2">
      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
        Parent Control Category (Optional Sub-Account Nesting)
      </label>
      <select
        value={newParentAccountId}
        onChange={(e) => setNewParentAccountId(e.target.value)}
        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 bg-white text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none cursor-pointer"
      >
        <option value="">-- Standalone Account (No Parent Category) --</option>
        {accounts.filter(a => a.type === newAccountType && a.is_system).map(p => (
          <option key={p.id} value={p.id}>
            {p.name} (Control Category)
          </option>
        ))}
      </select>
    </div>
  )}

  {newAccountType === 'liability' && (
    <div className="p-3.5 mt-3 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2">
      <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider block">
        Quick Loan / Liability Sub-Account Presets
      </span>
      <div className="flex flex-wrap gap-1.5">
        {[
          { name: 'Loan - HBL Bank', code: '2520' },
          { name: 'Loan - Meezan Bank', code: '2530' },
          { name: 'Vehicle Loan Payable', code: '2540' },
          { name: 'Short-Term Credit Facility', code: '2550' }
        ].map(preset => (
          <button
            key={preset.name}
            type="button"
            onClick={() => {
              setNewAccountName(preset.name);
              setNewAccountCode(preset.code);
              const defaultParent = accounts.find(a => a.type === 'liability' && (a.name === 'Long-Term Debt' || a.name === 'Short-Term Debt'));
              if (defaultParent) setNewParentAccountId(defaultParent.id);
            }}
            className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-amber-100 hover:text-amber-900 border border-amber-200 rounded-lg text-amber-800 transition-colors shadow-2xs cursor-pointer"
          >
            + {preset.name}
          </button>
        ))}
      </div>
    </div>
  )}`;

content = content.replace(targetPresets, replacementPresets);

fs.writeFileSync(coaPath, content, 'utf8');
console.log("Successfully patched modals in ChartOfAccountsManager.tsx!");
