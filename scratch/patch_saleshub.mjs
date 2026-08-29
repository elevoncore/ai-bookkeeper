import fs from 'fs';
import path from 'path';

const projectPath = 'd:\\build\\ai-bookkeeper';
const filePath = path.join(projectPath, 'src', 'components', 'dashboard', 'SalesHub.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update state definition
const stateOld = `const [paymentData, setPaymentData] = useState({ invoice_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer' });`;
const stateNew = `const [paymentData, setPaymentData] = useState({ invoice_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer', payment_account_id: '' });`;
content = content.replace(stateOld, stateNew);

// 2. Update modal trigger using regex
const triggerRegex = /setSelectedInvoiceForPayment\(inv\);\s*setPaymentData\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*invoice_id:\s*inv\.id,\s*amount:\s*balanceDue\.toString\(\)\s*\}\)\);/g;
content = content.replace(triggerRegex, `setSelectedInvoiceForPayment(inv);
  setPaymentData(prev => ({ 
    ...prev, 
    invoice_id: inv.id, 
    amount: balanceDue.toString(),
    payment_account_id: accounts.find(a => a.is_cash_account === true)?.id || ''
  }));`);

// 3. Replace handleLogPayment function entirely
const startIdx = content.indexOf(' async function handleLogPayment(e: React.FormEvent) {');
const endIdx = content.indexOf(' const [searchTerm, setSearchTerm] = useState');

console.log("startIdx:", startIdx, "endIdx:", endIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error("Could not locate handleLogPayment block");
  process.exit(1);
}

const handleLogPaymentReplacement = `  async function handleLogPayment(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!paymentData.amount || !paymentData.date) return toast.error("Please fill in all fields");

    const payNum = parseFloat(paymentData.amount);
    if (isNaN(payNum) || payNum <= 0) {
      return toast.error("Invalid payment amount. Amount must be greater than zero.");
    }

    const safeAmount = Math.round(parseToCents(paymentData.amount)) / 100;
    const invoice = selectedInvoiceForPayment || invoices.find(i => i.id === paymentData.invoice_id);
    const maxDue = invoice?.balance_due != null ? Number(invoice.balance_due) : Number(invoice?.total_amount || 0);

    if (maxDue > 0 && safeAmount > maxDue) {
      return toast.error(\`Payment amount (\${safeAmount.toLocaleString()} PKR) cannot exceed remaining balance due (\${maxDue.toLocaleString()} PKR).\`);
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Logging payment...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsSubmitting(false);
      return toast.error("Not authenticated", { id: toastId });
    }

    try {
      if (!invoice) throw new Error("Invoice not found");
      const currentPaid = Number(invoice.amount_paid || 0);
      const total = Number(invoice.total_amount || 0);
      const newPaid = currentPaid + safeAmount;
      const newBalance = Math.max(0, total - newPaid);
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      // 1. Update Invoice table
      const { error: invErr } = await supabase
        .from('invoices')
        .update({
          balance_due: newBalance,
          amount_paid: newPaid,
          status: newStatus
        })
        .eq('id', invoice.id);

      if (invErr) throw invErr;

      // 2. Insert payment record
      const isSettlement = paymentData.method === 'advance_settlement';
      const { data: paymentRecord, error: payErr } = await supabase
        .from('payments_received')
        .insert({
          user_id: user.id,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          amount: safeAmount,
          date: paymentData.date,
          payment_method: paymentData.method,
          is_advance: false,
          notes: isSettlement ? 'Settled from Customer Advance deposit' : 'Invoice Payment'
        })
        .select()
        .single();

      if (payErr) throw payErr;

      // 3. Post double-entry Journal Entry
      const accountsRes = await supabase.from('accounts').select('*').eq('user_id', user.id);
      const arAccount = accountsRes.data?.find(a => a.name.toLowerCase().includes('accounts receivable') || a.type === 'asset');
      
      let debitAccountId = '';
      if (isSettlement) {
        const custAdvAcc = accountsRes.data?.find(a => a.type === 'liability' && a.name.toLowerCase().includes('customer advance'));
        if (!custAdvAcc) throw new Error("Customer Advances account not found");
        debitAccountId = custAdvAcc.id;
      } else {
        if (!paymentData.payment_account_id) {
          throw new Error("Please select a deposit account");
        }
        debitAccountId = paymentData.payment_account_id;
      }

      if (debitAccountId && arAccount) {
        const { data: entry, error: entErr } = await supabase.from('journal_entries').insert({
          user_id: user.id,
          date: paymentData.date,
          description: isSettlement 
            ? \`Customer Advance Applied to Invoice INV-\${invoice.id.substring(0, 6).toUpperCase()}\`
            : \`Customer payment received for Invoice INV-\${invoice.id.substring(0, 6).toUpperCase()}\`,
          reference_type: 'invoice_payment',
          reference_id: invoice.id
        }).select().single();

        if (entErr) throw entErr;

        if (entry) {
          await supabase.from('journal_lines').insert([
            { journal_entry_id: entry.id, account_id: debitAccountId, debit: safeAmount, credit: 0 },
            { journal_entry_id: entry.id, account_id: arAccount.id, debit: 0, credit: safeAmount }
          ]);
        }
      }

      toast.success(isSettlement
        ? \`Applied \${safeAmount.toLocaleString()} PKR advance to Invoice!\`
        : \`Logged \${safeAmount.toLocaleString()} PKR payment for Invoice!\`,
        { id: toastId }
      );
      setIsSubmitting(false);
      setIsPaymentModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to log payment", { id: toastId });
      setIsSubmitting(false);
    }
  }

`;

content = content.substring(0, startIdx) + handleLogPaymentReplacement + content.substring(endIdx);

// 4. Update the Modal fields using robust regex
const modalStartIdx = content.search(/<form id="paymentForm" onSubmit=\{handleLogPayment\}/);
const matchEnd = content.match(/<\/form>\s*<div className="p-4 sm:p-6 border-t/);

if (modalStartIdx === -1 || !matchEnd) {
  console.error("Could not locate Log Payment Form markup in SalesHub.tsx");
  process.exit(1);
}
const modalEndIdx = matchEnd.index;

const modalReplacement = `<form id="paymentForm" onSubmit={handleLogPayment} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
  
  {/* INVOICE FINANCIAL SUMMARY BREAKDOWN */}
  {selectedInvoiceForPayment && (
    <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
      <div>
        <span className="text-gray-500 block text-[10px] uppercase font-bold">Total Invoiced</span>
        <span className="font-extrabold text-gray-900">{Number(selectedInvoiceForPayment.total_amount).toLocaleString()} PKR</span>
      </div>
      <div>
        <span className="text-gray-500 block text-[10px] uppercase font-bold">Already Paid</span>
        <span className="font-extrabold text-emerald-700">
          {Number(selectedInvoiceForPayment.amount_paid || (selectedInvoiceForPayment.total_amount - (selectedInvoiceForPayment.balance_due ?? 0))).toLocaleString()} PKR
        </span>
      </div>
      <div>
        <span className="text-gray-500 block text-[10px] uppercase font-bold">Remaining Due</span>
        <span className="font-extrabold text-rose-700">
          {Number(selectedInvoiceForPayment.balance_due ?? selectedInvoiceForPayment.total_amount).toLocaleString()} PKR
        </span>
      </div>
    </div>
  )}

  {/* ADVANCE SETTLEMENT UX */}
  {selectedInvoiceForPayment && (() => {
    const availableAdvance = getCustomerAdvanceBalance(selectedInvoiceForPayment.customer_id);
    if (availableAdvance <= 0) return null;
    const isSettlement = paymentData.method === 'advance_settlement';

    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-900">Apply Customer Advance</p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              This customer has <span className="font-extrabold">{availableAdvance.toLocaleString()} PKR</span> available in advance prepayments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isSettlement) {
                setPaymentData(prev => ({
                  ...prev,
                  method: 'Bank Transfer',
                  amount: Number(selectedInvoiceForPayment.balance_due ?? selectedInvoiceForPayment.total_amount).toString()
                }));
              } else {
                const maxApply = Math.min(availableAdvance, Number(selectedInvoiceForPayment.balance_due ?? selectedInvoiceForPayment.total_amount));
                setPaymentData(prev => ({
                  ...prev,
                  method: 'advance_settlement',
                  amount: maxApply.toString()
                }));
              }
            }}
            className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer \${
              isSettlement ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50'
            }\`}
          >
            {isSettlement ? '⚡ Settle Enabled' : '⚡ Use Advance'}
          </button>
        </div>
      </div>
    );
  })()}

  <div className="space-y-1">
    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount to Pay (PKR) *</label>
    <input 
      type="number" 
      step="0.01"
      required
      value={paymentData.amount}
      onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
      placeholder="Enter payment amount"
      className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-bold text-base"
    />
    {selectedInvoiceForPayment && Number(paymentData.amount) > 0 && (
      <p className="text-[11px] text-gray-500 mt-1 font-medium">
        {Number(paymentData.amount) < Number(selectedInvoiceForPayment.balance_due ?? selectedInvoiceForPayment.total_amount) ? (
          <span className="text-amber-700 font-bold">
            ⚠️ Partial Payment: Remaining balance will be {(Number(selectedInvoiceForPayment.balance_due ?? selectedInvoiceForPayment.total_amount) - Number(paymentData.amount)).toLocaleString()} PKR (Status: PARTIALLY PAID)
          </span>
        ) : (
          <span className="text-emerald-700 font-bold">
            ✓ Full Payment: Invoice will be marked PAID
          </span>
        )}
      </p>
    )}
  </div>

  <div className="space-y-1">
    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Date of Payment *</label>
    <input 
      type="date" 
      required
      value={paymentData.date}
      onChange={e => setPaymentData({...paymentData, date: e.target.value})}
      className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-gray-900"
    />
  </div>
  
  {paymentData.method !== 'advance_settlement' ? (
    <>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Method</label>
        <select 
          value={paymentData.method}
          onChange={e => setPaymentData({...paymentData, method: e.target.value})}
          className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-gray-900"
        >
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Cash">Cash</option>
          <option value="Cheque">Cheque</option>
          <option value="Credit Card">Credit Card</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Deposit To (Cash/Bank Account) *</label>
        <select 
          value={paymentData.payment_account_id}
          onChange={e => setPaymentData({...paymentData, payment_account_id: e.target.value})}
          required
          className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-gray-900"
        >
          <option value="">-- Select Cash/Bank Account --</option>
          {accounts.filter(a => a.is_cash_account === true).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
    </>
  ) : (
    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 font-bold">
      ℹ️ Settle using Customer Advance: Cash accounts will be bypassed, and the outstanding balance will be reduced against the customer's prepaid advance ledger.
    </div>
  )}
</form>`;

content = content.substring(0, modalStartIdx) + modalReplacement + content.substring(modalEndIdx + matchEnd[0].indexOf('<div'));

fs.writeFileSync(filePath, content, 'utf8');
console.log("✓ Patched SalesHub.tsx successfully!");
