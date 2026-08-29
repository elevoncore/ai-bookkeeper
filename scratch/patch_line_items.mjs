import fs from 'fs';
import path from 'path';

const projectPath = 'd:\\build\\ai-bookkeeper';

// ==========================================
// 1. PATCH SalesHub.tsx
// ==========================================
console.log("Patching SalesHub.tsx...");
const salesPath = path.join(projectPath, 'src', 'components', 'dashboard', 'SalesHub.tsx');
let salesContent = fs.readFileSync(salesPath, 'utf8').replace(/\r\n/g, '\n');

// Add invoiceLines state
const searchState = "const [paymentData, setPaymentData] = useState";
const stateIdx = salesContent.indexOf(searchState);
if (stateIdx === -1) throw new Error("Could not find paymentData state in SalesHub");
salesContent = salesContent.substring(0, stateIdx) + 
  `const [invoiceLines, setInvoiceLines] = useState<any[]>([{ product_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }]);\n  ` +
  salesContent.substring(stateIdx);

// Add invoiceLines reset on new invoice button click
salesContent = salesContent.replace(
  "setNewInvoice({ id: '', customer_id: '', issue_date: new Date().toISOString().split('T')[0], amount: '' });",
  "setNewInvoice({ id: '', customer_id: '', issue_date: new Date().toISOString().split('T')[0], amount: '' });\n    setInvoiceLines([{ product_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }]);"
);

// Populate invoiceLines on edit modal open
const openEditOld = `  function openEditModal(inv: any) {
    setNewInvoice({
      id: inv.id,
      customer_id: inv.customer_id,
      issue_date: inv.issue_date,
      amount: inv.total_amount.toString()
    });
    setIsEditing(true);
    setIsInvoiceModalOpen(true);
  }`;

const openEditNew = `  function openEditModal(inv: any) {
    setNewInvoice({
      id: inv.id,
      customer_id: inv.customer_id,
      issue_date: inv.issue_date,
      amount: inv.total_amount.toString()
    });
    if (inv.invoice_lines && inv.invoice_lines.length > 0) {
      setInvoiceLines(inv.invoice_lines.map((l: any) => ({
        product_id: l.product_id || '',
        description: l.description || '',
        quantity: l.quantity || 1,
        unit_price: l.unit_price || 0,
        total: l.total || 0
      })));
    } else {
      setInvoiceLines([{ product_id: '', description: 'Manual entry', quantity: 1, unit_price: Number(inv.total_amount), total: Number(inv.total_amount) }]);
    }
    setIsEditing(true);
    setIsInvoiceModalOpen(true);
  }`;

salesContent = salesContent.replace(openEditOld, openEditNew);

// Replace handleCreateOrUpdateInvoice body to use invoiceLines
const handleCreateStart = salesContent.indexOf(" async function handleCreateOrUpdateInvoice(e: React.FormEvent) {");
const handleCreateEnd = salesContent.indexOf(" async function handleLogCustomerAdvance(e: React.FormEvent) {");

if (handleCreateStart === -1 || handleCreateEnd === -1) {
  throw new Error("Could not locate handleCreateOrUpdateInvoice in SalesHub");
}

const handleCreateReplacement = `  async function handleCreateOrUpdateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!newInvoice.customer_id || !newInvoice.issue_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    // Calculate Grand Total from rows
    const invoiceGrandTotal = invoiceLines.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);
    if (invoiceGrandTotal <= 0) {
      toast.error("Invoice total must be greater than zero. Please add line items.");
      return;
    }

    const toastId = toast.loading(isEditing ? "Updating Invoice..." : "Creating Invoice...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.dismiss(toastId);
      return toast.error("Not authenticated");
    }
    
    if (isEditing) {
      const currentInvoice = invoices.find(i => i.id === newInvoice.id);
      
      const { error } = await supabase.rpc('update_invoice_atomic', {
        p_invoice_id: newInvoice.id,
        p_user_id: user.id,
        p_customer_id: newInvoice.customer_id,
        p_issue_date: newInvoice.issue_date,
        p_due_date: null,
        p_status: currentInvoice?.status || 'open',
        p_total_amount: invoiceGrandTotal,
        p_receipt_url: currentInvoice?.receipt_url || null,
        p_line_items: invoiceLines.map(l => ({
          product_id: l.product_id || null,
          description: l.description || 'Line Item',
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          total: Number(l.quantity) * Number(l.unit_price)
        }))
      });
      
      if (error) {
        toast.error(\`Error: \${error.message}\`, { id: toastId });
      } else {
        try { await supabase.from('invoices').update({ is_manually_edited: true }).eq('id', newInvoice.id); } catch (_) {}
        setEditedInvoiceIds(prev => new Set(prev).add(newInvoice.id));
        toast.success("Invoice updated successfully!", { id: toastId });
        closeModal();
        fetchData();
      }
    } else {
      const applyAmt = applyAdvanceToInvoice ? parseFloat(advanceAmountToApply) || 0 : 0;
      const initialBalance = Math.max(0, invoiceGrandTotal - applyAmt);
      const initialStatus = initialBalance <= 0 ? 'paid' : (applyAmt > 0 ? 'partial' : 'open');

      const { data: insertedId, error: createError } = await supabase.rpc('create_invoice_with_lines_atomic', {
        p_user_id: user.id,
        p_customer_id: newInvoice.customer_id,
        p_issue_date: newInvoice.issue_date,
        p_due_date: null,
        p_status: initialStatus,
        p_total_amount: invoiceGrandTotal,
        p_receipt_url: null,
        p_line_items: invoiceLines.map(l => ({
          product_id: l.product_id || null,
          description: l.description || 'Line Item',
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          total: Number(l.quantity) * Number(l.unit_price)
        })),
        p_currency_code: 'PKR',
        p_exchange_rate: 1.0,
        p_original_amount: invoiceGrandTotal
      });

      if (createError) {
        toast.error(\`Error: \${createError.message}\`, { id: toastId });
      } else {
        try { await supabase.from('invoices').update({ is_ai_verified: true, created_by_source: 'MANUAL', is_manually_edited: false }).eq('id', insertedId); } catch (_) {}

        // Apply Advance if toggled
        if (applyAdvanceToInvoice && insertedId && applyAmt > 0) {
          const { error: applyError } = await supabase.rpc('apply_customer_advance_atomic', {
            p_user_id: user.id,
            p_customer_id: newInvoice.customer_id,
            p_invoice_id: insertedId,
            p_amount: applyAmt,
            p_date: newInvoice.issue_date
          });

          if (!applyError) {
            toast.success(\`Invoice created and \${applyAmt.toLocaleString()} PKR advance applied!\`, { id: toastId });
          } else {
            // JS Fallback
            await supabase.from('invoices').update({
              amount_paid: applyAmt,
              balance_due: initialBalance,
              status: initialStatus
            }).eq('id', insertedId);

            await supabase.from('payments_received').insert({
              user_id: user.id,
              invoice_id: insertedId,
              customer_id: newInvoice.customer_id,
              amount: applyAmt,
              date: newInvoice.issue_date,
              payment_method: 'advance_settlement',
              is_advance: false,
              notes: 'Settled from Customer Advance deposit'
            });

            const custAdvAcc = accounts.find(a => a.type === 'liability' && a.name.toLowerCase().includes('customer advance'));
            const arAcc = accounts.find(a => a.type === 'asset' && (a.name.toLowerCase().includes('receivable') || a.name.toLowerCase().includes('a/r')));

            if (custAdvAcc && arAcc) {
              await createJournalEntryAtomic(supabase, {
                user_id: user.id,
                date: newInvoice.issue_date,
                description: \`Customer Advance Applied to Invoice INV-\${insertedId.substring(0, 6).toUpperCase()}\`,
                lines: [
                  { account_id: custAdvAcc.id, debit: applyAmt, credit: 0 },
                  { account_id: arAcc.id, debit: 0, credit: applyAmt }
                ],
                created_by_source: 'MANUAL'
              });
            }
          }
        }

        toast.success("Invoice created successfully!", { id: toastId });
        closeModal();
        fetchData();
      }
    }
  }

`;

salesContent = salesContent.substring(0, handleCreateStart) + handleCreateReplacement + salesContent.substring(handleCreateEnd);

// Replace amount input with dynamic row builder in the JSX modal
const searchFormInput = `<div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount (PKR) *</label>
              <input 
                type="number" 
                step="0.01"
                required
                value={newInvoice.amount}
                onChange={e => setNewInvoice({...newInvoice, amount: e.target.value})}
                placeholder="0.00"
                className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 font-bold text-base"
              />
            </div>`;

const formInputStart = salesContent.indexOf(searchFormInput);
if (formInputStart === -1) throw new Error("Could not find Amount input in SalesHub invoice modal markup");

const dynamicRowsReplacement = `<div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Line Items *</label>
                <button
                  type="button"
                  onClick={() => setInvoiceLines([...invoiceLines, { product_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }])}
                  className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 cursor-pointer"
                >
                  + Add Row
                </button>
              </div>
              <div className="space-y-2.5">
                {invoiceLines.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-gray-50/50 p-2.5 rounded-xl border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <select
                        value={row.product_id}
                        onChange={e => {
                          const prodId = e.target.value;
                          const prod = products.find(p => p.id === prodId);
                          const updated = [...invoiceLines];
                          updated[idx] = {
                            ...updated[idx],
                            product_id: prodId,
                            description: prod ? prod.name : '',
                            unit_price: prod ? Number(prod.price) : 0,
                            total: prod ? Number(prod.price) * Number(updated[idx].quantity) : 0
                          };
                          setInvoiceLines(updated);
                        }}
                        required
                        className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-lg bg-white outline-none"
                      >
                        <option value="">-- Select Product/Service --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({Number(p.price).toLocaleString()} PKR)</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-16">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        required
                        value={row.quantity}
                        onChange={e => {
                          const qty = parseInt(e.target.value) || 1;
                          const updated = [...invoiceLines];
                          updated[idx] = {
                            ...updated[idx],
                            quantity: qty,
                            total: qty * Number(updated[idx].unit_price)
                          };
                          setInvoiceLines(updated);
                        }}
                        className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg text-center"
                      />
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        required
                        value={row.unit_price}
                        onChange={e => {
                          const price = parseFloat(e.target.value) || 0;
                          const updated = [...invoiceLines];
                          updated[idx] = {
                            ...updated[idx],
                            unit_price: price,
                            total: Number(updated[idx].quantity) * price
                          };
                          setInvoiceLines(updated);
                        }}
                        className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg text-right font-bold"
                      />
                    </div>

                    <div className="w-24 text-right pr-1">
                      <span className="text-xs font-bold text-slate-800">
                        {(Number(row.quantity) * Number(row.unit_price)).toLocaleString()} PKR
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={invoiceLines.length === 1}
                      onClick={() => {
                        const updated = [...invoiceLines];
                        updated.splice(idx, 1);
                        setInvoiceLines(updated);
                      }}
                      className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer p-1"
                      title="Remove Row"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-slate-900 text-white rounded-xl flex justify-between items-center shadow-md">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Grand Total</span>
                <span className="text-base font-black text-emerald-400">
                  {invoiceLines.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0).toLocaleString()} PKR
                </span>
              </div>
            </div>`;

salesContent = salesContent.replace(searchFormInput, dynamicRowsReplacement);

// Also replace the interactive math block preview in invoice modal
salesContent = salesContent.replace(
  "const invAmt = parseFloat(newInvoice.amount) || 0;",
  "const invAmt = invoiceLines.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);"
);

fs.writeFileSync(salesPath, salesContent, 'utf8');
console.log("✓ SalesHub.tsx patched successfully!");


// ==========================================
// 2. PATCH PurchasesHub.tsx
// ==========================================
console.log("Patching PurchasesHub.tsx...");
const purchasesPath = path.join(projectPath, 'src', 'components', 'dashboard', 'PurchasesHub.tsx');
let purchasesContent = fs.readFileSync(purchasesPath, 'utf8').replace(/\r\n/g, '\n');

// Add products & billLines state, and fetch products in useEffect
const stateBillIdx = purchasesContent.indexOf("const [paymentData, setPaymentData] = useState");
if (stateBillIdx === -1) throw new Error("Could not find paymentData state in PurchasesHub");
purchasesContent = purchasesContent.substring(0, stateBillIdx) + 
  `const [products, setProducts] = useState<any[]>([]);\n  const [billLines, setBillLines] = useState<any[]>([{ product_id: '', account_id: '', description: '', quantity: 1, unit_price: 0, amount: 0 }]);\n  ` +
  purchasesContent.substring(stateBillIdx);

// Modify fetchData to query products table
const fetchQueryOld = `      const [
        { data: billsData, error: billsErr },
        { data: suppliersData, error: suppliersErr },
        { data: accountsRes, error: accErr }
      ] = await Promise.all([`;

const fetchQueryNew = `      const [
        { data: billsData, error: billsErr },
        { data: suppliersData, error: suppliersErr },
        { data: accountsRes, error: accErr },
        { data: prodData }
      ] = await Promise.all([`;

purchasesContent = purchasesContent.replace(fetchQueryOld, fetchQueryNew);

const fetchPromisesOld = `        supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(account_id, quantity, unit_price, amount, description, products(name, cost, is_inventory_tracked))').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').eq('user_id', user.id).order('name'),
        supabase.from('accounts').select('*').eq('user_id', user.id)
      ]);`;

const fetchPromisesNew = `        supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(account_id, quantity, unit_price, amount, description, products(name, cost, is_inventory_tracked))').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').eq('user_id', user.id).order('name'),
        supabase.from('accounts').select('*').eq('user_id', user.id),
        supabase.from('products').select('*').eq('user_id', user.id).order('name')
      ]);`;

purchasesContent = purchasesContent.replace(fetchPromisesOld, fetchPromisesNew);

const fetchSetterOld = `      if (accountsRes) setChartOfAccounts(accountsRes);`;
const fetchSetterNew = `      if (accountsRes) setChartOfAccounts(accountsRes);\n      if (prodData) setProducts(prodData);`;
purchasesContent = purchasesContent.replace(fetchSetterOld, fetchSetterNew);

// Add billLines reset on new bill button click
purchasesContent = purchasesContent.replace(
  "setNewBill({ id: '', supplier_id: '', issue_date: new Date().toISOString().split('T')[0], amount: '', account_id: '', external_reference_number: '' });",
  "setNewBill({ id: '', supplier_id: '', issue_date: new Date().toISOString().split('T')[0], amount: '', account_id: '', external_reference_number: '' });\n    setBillLines([{ product_id: '', account_id: '', description: '', quantity: 1, unit_price: 0, amount: 0 }]);"
);

// Populate billLines on edit modal open
const openEditBillOld = `  function openEditModal(bill: any) {
    setNewBill({
      id: bill.id,
      supplier_id: bill.supplier_id,
      issue_date: bill.issue_date,
      amount: bill.total_amount.toString(),
      account_id: bill.bill_lines?.[0]?.account_id || '',
      external_reference_number: bill.external_reference_number || ''
    });
    setIsEditing(true);
    setIsModalOpen(true);
  }`;

const openEditBillNew = `  function openEditModal(bill: any) {
    setNewBill({
      id: bill.id,
      supplier_id: bill.supplier_id,
      issue_date: bill.issue_date,
      amount: bill.total_amount.toString(),
      account_id: bill.bill_lines?.[0]?.account_id || '',
      external_reference_number: bill.external_reference_number || ''
    });
    if (bill.bill_lines && bill.bill_lines.length > 0) {
      setBillLines(bill.bill_lines.map((l: any) => ({
        product_id: l.product_id || '',
        account_id: l.account_id || '',
        description: l.description || '',
        quantity: l.quantity || 1,
        unit_price: l.unit_price || 0,
        amount: l.amount || 0
      })));
    } else {
      setBillLines([{ product_id: '', account_id: bill.bill_lines?.[0]?.account_id || '', description: 'Manual entry', quantity: 1, unit_price: Number(bill.total_amount), amount: Number(bill.total_amount) }]);
    }
    setIsEditing(true);
    setIsModalOpen(true);
  }`;

purchasesContent = purchasesContent.replace(openEditBillOld, openEditBillNew);

// Replace handleCreateOrUpdateBill function block to support dynamic billLines
const handleBillCreateStart = purchasesContent.indexOf(" async function handleCreateOrUpdateBill(e: React.FormEvent) {");
const handleBillCreateEnd = purchasesContent.indexOf(" async function handleLogPayment(e: React.FormEvent) {");

if (handleBillCreateStart === -1 || handleBillCreateEnd === -1) {
  throw new Error("Could not find handleCreateOrUpdateBill in PurchasesHub");
}

const handleBillCreateReplacement = `  async function handleCreateOrUpdateBill(e: React.FormEvent) {
    e.preventDefault();
    if (!newBill.supplier_id || !newBill.issue_date) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const billGrandTotal = billLines.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);
    if (billGrandTotal <= 0) {
      toast.error("Bill total must be greater than zero. Please add line items.");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(isEditing ? "Updating Bill..." : "Creating Bill...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("User not authenticated.");
      setIsSubmitting(false);
      return;
    }

    try {
      const extRef = newBill.external_reference_number?.trim() || null;
      if (isEditing && newBill.id) {
        const { error: billError } = await supabase.rpc('update_bill_atomic', {
          p_bill_id: newBill.id,
          p_user_id: user.id,
          p_supplier_id: newBill.supplier_id,
          p_issue_date: newBill.issue_date,
          p_due_date: null,
          p_status: 'open',
          p_total_amount: billGrandTotal,
          p_receipt_url: null,
          p_line_items: billLines.map(l => ({
            product_id: l.product_id || null,
            account_id: l.account_id || null,
            description: l.description || 'Line Item',
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            amount: Number(l.quantity) * Number(l.unit_price)
          }))
        });

        if (billError) throw billError;

        setEditedBillIds(prev => new Set(prev).add(newBill.id));
        toast.success("Bill updated successfully!", { id: toastId });
        closeModal();
        fetchData();
      } else {
        const applyAmt = applyAdvanceToBill ? parseFloat(advanceAmountToApply) || 0 : 0;
        const initialBalance = Math.max(0, billGrandTotal - applyAmt);
        const initialStatus = initialBalance <= 0 ? 'paid' : (applyAmt > 0 ? 'partial' : 'open');

        const { data: createdBillId, error: billError } = await supabase.rpc('create_bill_with_lines_atomic', {
          p_user_id: user.id,
          p_supplier_id: newBill.supplier_id,
          p_issue_date: newBill.issue_date,
          p_due_date: null,
          p_status: initialStatus,
          p_total_amount: billGrandTotal,
          p_receipt_url: null,
          p_line_items: billLines.map(l => ({
            product_id: l.product_id || null,
            account_id: l.account_id || null,
            description: l.description || 'Line Item',
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            amount: Number(l.quantity) * Number(l.unit_price)
          }))
        });

        if (billError) throw billError;

        // Verify manual bill immediately to post the base entry
        if (createdBillId) {
          try {
            await supabase.from('bills').update({ is_ai_verified: true }).eq('id', createdBillId);
          } catch (_) {}

          // If an advance was applied, record the settlement
          if (applyAmt > 0) {
            const { error: rpcErr } = await supabase.rpc('apply_supplier_advance_atomic', {
              p_user_id: user.id,
              p_supplier_id: newBill.supplier_id,
              p_bill_id: createdBillId,
              p_amount: applyAmt,
              p_date: newBill.issue_date
            });

            if (rpcErr) {
              console.warn("RPC apply_supplier_advance_atomic fallback:", rpcErr);
              await supabase.from('payments_made').insert({
                user_id: user.id,
                bill_id: createdBillId,
                supplier_id: newBill.supplier_id,
                amount: applyAmt,
                date: newBill.issue_date,
                payment_method: 'advance_settlement',
                is_advance: false,
                notes: 'Settled from Supplier Advance prepayment'
              });

              const apAcc = chartOfAccounts.find(a => a.type === 'liability' && a.name.toLowerCase().includes('payable'));
              const suppAdvAcc = chartOfAccounts.find(a => a.type === 'asset' && a.name.toLowerCase().includes('supplier advance'));

              if (apAcc && suppAdvAcc) {
                await createJournalEntryAtomic(supabase, {
                  user_id: user.id,
                  date: newBill.issue_date,
                  description: \`Supplier Advance Applied to Bill \${createdBillId.substring(0, 8)}\`,
                  lines: [
                    { account_id: apAcc.id, debit: applyAmt, credit: 0 },
                    { account_id: suppAdvAcc.id, debit: 0, credit: applyAmt }
                  ],
                  created_by_source: 'MANUAL'
                });
              }
            }
          }
        }

        toast.success("Bill created successfully!", { id: toastId });
        closeModal();
        fetchData();
      }
    } catch (err: any) {
      console.error("Failed to save bill:", err);
      toast.error(\`Error saving bill: \${err.message || err}\`, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  }

`;

purchasesContent = purchasesContent.substring(0, handleBillCreateStart) + handleBillCreateReplacement + purchasesContent.substring(handleBillCreateEnd);

// Replace amount & account_id dropdown with dynamic row builder in the JSX modal
const searchBillInputsOld = `            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Expense/Inventory Account *</label>
                <select
                  value={newBill.account_id}
                  onChange={(e) => setNewBill({ ...newBill, account_id: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 bg-white rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-green-500 outline-none"
                >
                  <option value="">-- Select GL Account --</option>
                  {chartOfAccounts.filter(a => a.type === 'expense' || a.name.toLowerCase().includes('expense') || a.name.toLowerCase().includes('inventory')).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Total Bill Amount (PKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newBill.amount}
                  onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })}
                  placeholder="0.00"
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 bg-white rounded-xl text-base font-bold text-gray-900 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>`;

const billInputsStart = purchasesContent.indexOf(searchBillInputsOld);
if (billInputsStart === -1) throw new Error("Could not find account/amount fields in PurchasesHub bill modal markup");

const dynamicBillRowsReplacement = `<div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Bill Line Items *</label>
                <button
                  type="button"
                  onClick={() => setBillLines([...billLines, { product_id: '', account_id: '', description: '', quantity: 1, unit_price: 0, amount: 0 }])}
                  className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 cursor-pointer"
                >
                  + Add Row
                </button>
              </div>
              <div className="space-y-2.5">
                {billLines.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-gray-50/50 p-2.5 rounded-xl border border-gray-200">
                    <div className="flex-1 min-w-0">
                      <select
                        value={row.product_id ? \`prod:\${row.product_id}\` : row.account_id ? \`acc:\${row.account_id}\` : ''}
                        onChange={e => {
                          const val = e.target.value;
                          const updated = [...billLines];
                          if (val.startsWith('prod:')) {
                            const pId = val.substring(5);
                            const prod = products.find(p => p.id === pId);
                            updated[idx] = {
                              ...updated[idx],
                              product_id: pId,
                              account_id: '',
                              description: prod ? prod.name : '',
                              unit_price: prod ? Number(prod.cost || prod.price) : 0,
                              amount: prod ? Number(prod.cost || prod.price) * Number(updated[idx].quantity) : 0
                            };
                          } else if (val.startsWith('acc:')) {
                            const accId = val.substring(4);
                            const acc = chartOfAccounts.find(a => a.id === accId);
                            updated[idx] = {
                              ...updated[idx],
                              product_id: '',
                              account_id: accId,
                              description: acc ? acc.name : '',
                              unit_price: 0,
                              amount: 0
                            };
                          } else {
                            updated[idx] = { ...updated[idx], product_id: '', account_id: '', description: '', unit_price: 0, amount: 0 };
                          }
                          setBillLines(updated);
                        }}
                        required
                        className="w-full px-2.5 py-2 text-xs border border-gray-300 rounded-lg bg-white outline-none"
                      >
                        <option value="">-- Choose Product or GL Expense Account --</option>
                        <optgroup label="Inventory / Products (Catalog)">
                          {products.map(p => (
                            <option key={p.id} value={\`prod:\${p.id}\`}>{p.name} (Cost: {Number(p.cost).toLocaleString()} PKR)</option>
                          ))}
                        </optgroup>
                        <optgroup label="General Ledger Expenses">
                          {chartOfAccounts.filter(a => a.type === 'expense' || a.name.toLowerCase().includes('expense') || a.name.toLowerCase().includes('inventory')).map(a => (
                            <option key={a.id} value={\`acc:\${a.id}\`}>{a.name} ({a.type.toUpperCase()})</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="w-16">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        required
                        value={row.quantity}
                        onChange={e => {
                          const qty = parseInt(e.target.value) || 1;
                          const updated = [...billLines];
                          updated[idx] = {
                            ...updated[idx],
                            quantity: qty,
                            amount: qty * Number(updated[idx].unit_price)
                          };
                          setBillLines(updated);
                        }}
                        className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg text-center"
                      />
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Unit Price"
                        required
                        value={row.unit_price}
                        onChange={e => {
                          const price = parseFloat(e.target.value) || 0;
                          const updated = [...billLines];
                          updated[idx] = {
                            ...updated[idx],
                            unit_price: price,
                            amount: Number(updated[idx].quantity) * price
                          };
                          setBillLines(updated);
                        }}
                        className="w-full px-2 py-2 text-xs border border-gray-300 rounded-lg text-right font-bold"
                      />
                    </div>

                    <div className="w-24 text-right pr-1">
                      <span className="text-xs font-bold text-slate-800">
                        {(Number(row.quantity) * Number(row.unit_price)).toLocaleString()} PKR
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={billLines.length === 1}
                      onClick={() => {
                        const updated = [...billLines];
                        updated.splice(idx, 1);
                        setBillLines(updated);
                      }}
                      className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer p-1"
                      title="Remove Row"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-slate-900 text-white rounded-xl flex justify-between items-center shadow-md">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Grand Total</span>
                <span className="text-base font-black text-emerald-400">
                  {billLines.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0).toLocaleString()} PKR
                </span>
              </div>
            </div>`;

purchasesContent = purchasesContent.replace(searchBillInputsOld, dynamicBillRowsReplacement);

// Also replace the interactive math block preview in bill modal
purchasesContent = purchasesContent.replace(
  "const billAmt = parseFloat(newBill.amount) || 0;",
  "const billAmt = billLines.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);"
);

fs.writeFileSync(purchasesPath, purchasesContent, 'utf8');
console.log("✓ PurchasesHub.tsx patched successfully!");
