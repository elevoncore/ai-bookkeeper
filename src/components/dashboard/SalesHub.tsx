'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, FileText, Users, Package, Edit2, Trash2, Loader2, X, AlertCircle, DollarSign, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';
import { createJournalEntryAtomic, JournalLineItem } from '@/utils/journalEntry';

export default function SalesHub() {
 const [mounted, setMounted] = useState(false);
 const [activeTab, setActiveTab] = useState<'invoices' | 'customers' | 'products'>('invoices');
 const [invoices, setInvoices] = useState<any[]>([]);
 const [customers, setCustomers] = useState<any[]>([]);
 const [products, setProducts] = useState<any[]>([]);
 const [accounts, setAccounts] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
 setMounted(true);
 }, []);
 
 const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
 const [newInvoice, setNewInvoice] = useState({ id: '', customer_id: '', issue_date: '', amount: '' });
 const [isEditing, setIsEditing] = useState(false);
 
 const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
 const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
 const [paymentData, setPaymentData] = useState({ invoice_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer' });
 const [isSubmitting, setIsSubmitting] = useState(false);

 // Customer Advance Modal State
 const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
 const [advanceData, setAdvanceData] = useState({
   customer_id: '',
   amount: '',
   date: new Date().toISOString().split('T')[0],
   method: 'Bank Transfer',
   deposit_account_id: '',
   notes: ''
 });
 const [isAdvanceSubmitting, setIsAdvanceSubmitting] = useState(false);
 const [paymentsReceived, setPaymentsReceived] = useState<any[]>([]);

 // Advance Application on New Invoice State
 const [applyAdvanceToInvoice, setApplyAdvanceToInvoice] = useState(false);
 const [advanceAmountToApply, setAdvanceAmountToApply] = useState('');

 // Quick Cash Sale State (Walk-in Customer)
 const [isQuickSaleModalOpen, setIsQuickSaleModalOpen] = useState(false);
 const [quickSaleData, setQuickSaleData] = useState({
 date: new Date().toISOString().split('T')[0],
 amount: '',
 description: '',
 product_id: '',
 quantity: '1',
 cost: '',
 account_id: ''
 });

 const [selectedCustomerStatement, setSelectedCustomerStatement] = useState<any>(null);
 const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
 const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
 const [isProductModalOpen, setIsProductModalOpen] = useState(false);
 const [editingProduct, setEditingProduct] = useState<{ id?: string; name: string; price: string; cost: string; is_inventory_tracked: boolean }>({ name: '', price: '', cost: '', is_inventory_tracked: true });
 const [editedInvoiceIds, setEditedInvoiceIds] = useState<Set<string>>(new Set());

 // Lock background scroll when any modal is open
 useEffect(() => {
 if (isInvoiceModalOpen || isPaymentModalOpen || isCustomerModalOpen || isProductModalOpen || isQuickSaleModalOpen || selectedCustomerStatement || isAdvanceModalOpen) {
 document.body.style.overflow = 'hidden';
 } else {
 document.body.style.overflow = 'unset';
 }
 return () => {
 document.body.style.overflow = 'unset';
 };
 }, [isInvoiceModalOpen, isPaymentModalOpen, isCustomerModalOpen, isProductModalOpen, isQuickSaleModalOpen, selectedCustomerStatement, isAdvanceModalOpen]);

 function getCustomerAdvanceBalance(customerId: string): number {
   if (!customerId) return 0;
   const customerPayments = paymentsReceived.filter(p => p.customer_id === customerId);
   const totalAdvancesReceived = customerPayments
     .filter(p => p.is_advance)
     .reduce((sum, p) => sum + Number(p.amount || 0), 0);
   const totalAdvancesApplied = customerPayments
     .filter(p => p.payment_method === 'advance_settlement')
     .reduce((sum, p) => sum + Number(p.amount || 0), 0);
   return Math.max(0, totalAdvancesReceived - totalAdvancesApplied);
 }

 function getEntityId(prefix: string, item: any) {
 if (item.code) return item.code;
 if (item.name === 'Walk-in Customer') return 'CUST-WALKIN';
 const idStr = item.id ? item.id.substring(0, 6).toUpperCase() : '001';
 return `${prefix}-${idStr}`;
 }

 function openEditProductModal(p: any) {
 setEditingProduct({
 id: p.id,
 name: p.name || '',
 price: (p.price || 0).toString(),
 cost: (p.cost || 0).toString(),
 is_inventory_tracked: !!p.is_inventory_tracked
 });
 setIsProductModalOpen(true);
 }

 async function handleCreateCustomer(e: React.FormEvent) {
 e.preventDefault();
 if (!newCustomer.name) return toast.error("Customer name is required");
 
 const toastId = toast.loading("Creating customer...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.dismiss(toastId);
 return toast.error("Not authenticated");
 }

 const { error } = await supabase.from('customers').insert({
 user_id: user.id,
 name: newCustomer.name,
 email: newCustomer.email || null,
 phone: newCustomer.phone || null
 });

 if (error) {
 toast.error(`Error creating customer: ${error.message}`, { id: toastId });
 } else {
 toast.success("Customer created successfully!", { id: toastId });
 setIsCustomerModalOpen(false);
 setNewCustomer({ name: '', email: '', phone: '' });
 fetchData();
 }
 }

 async function handleSaveProduct(e: React.FormEvent) {
 e.preventDefault();
 if (!editingProduct.name) return toast.error("Product name is required");
 
 const toastId = toast.loading(editingProduct.id ? "Updating product..." : "Creating product...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.dismiss(toastId);
 return toast.error("Not authenticated");
 }

 const safePriceCents = parseToCents(editingProduct.price);
 const safeCostCents = parseToCents(editingProduct.cost);
 const priceVal = Math.round(safePriceCents) / 100;
 const costVal = Math.round(safeCostCents) / 100;

 let error = null;

 if (editingProduct.id) {
 const { error: err } = await supabase
 .from('products')
 .update({
 name: editingProduct.name,
 price: priceVal,
 cost: costVal,
 is_inventory_tracked: editingProduct.is_inventory_tracked
 })
 .eq('id', editingProduct.id)
 .eq('user_id', user.id);
 error = err;
 } else {
 const { error: err } = await supabase
 .from('products')
 .insert({
 user_id: user.id,
 name: editingProduct.name,
 price: priceVal,
 cost: costVal,
 inventory_count: 0,
 is_inventory_tracked: editingProduct.is_inventory_tracked
 });
 error = err;
 }

 if (error) {
 toast.error(`Error saving product: ${error.message}`, { id: toastId });
 } else {
 toast.success(editingProduct.id ? "Product updated successfully!" : "Product created successfully!", { id: toastId });
 setIsProductModalOpen(false);
 fetchData();
 }
 }

 const supabase = createBrowserClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 );

 useEffect(() => {
 fetchData();
 }, [activeTab]);

 async function fetchData() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [payRes, custRes, prodRes, accRes] = await Promise.all([
      supabase.from('payments_received').select('*').eq('user_id', user.id),
      supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
      supabase.from('products').select('*').eq('user_id', user.id).order('name'),
      supabase.from('accounts').select('*').eq('user_id', user.id).order('name')
    ]);

    if (payRes.data) setPaymentsReceived(payRes.data);
    if (custRes.data) setCustomers(custRes.data);
    if (prodRes.data) setProducts(prodRes.data);
    if (accRes.data) setAccounts(accRes.data);

    if (activeTab === 'invoices') {
      const { data: invData } = await supabase
        .from('invoices')
        .select('*, customers(id, name, email, phone), invoice_lines(description, quantity, total, products(cost, is_inventory_tracked))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (invData) setInvoices(invData);
    } else if (activeTab === 'customers') {
      if (custRes.data) setCustomers(custRes.data);
    } else if (activeTab === 'products') {
      if (prodRes.data) setProducts(prodRes.data);
    }
    
    setIsLoading(false);
  }

  // Pre-fetch auxiliary data for modals
  useEffect(() => {
    async function getAuxData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [custRes, prodRes, accRes, payRes] = await Promise.all([
        supabase.from('customers').select('*').eq('user_id', user.id).order('name'),
        supabase.from('products').select('*').eq('user_id', user.id).order('name'),
        supabase.from('accounts').select('*').eq('user_id', user.id).order('name'),
        supabase.from('payments_received').select('*').eq('user_id', user.id)
      ]);
      if (custRes.data) setCustomers(custRes.data);
      if (prodRes.data) setProducts(prodRes.data);
      if (accRes.data) setAccounts(accRes.data);
      if (payRes.data) setPaymentsReceived(payRes.data);
    }
    getAuxData();
  }, []);

 async function handleQuickCashSale(e: React.FormEvent) {
 e.preventDefault();
 if (isSubmitting) return;
 if (!quickSaleData.amount || Number(quickSaleData.amount) <= 0) {
 return toast.error("Please enter a valid sale amount");
 }

 setIsSubmitting(true);
 const toastId = toast.loading("Recording quick cash sale...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 setIsSubmitting(false);
 return toast.error("Not authenticated", { id: toastId });
 }

 try {
 const saleAmount = parseFloat(quickSaleData.amount);
 if (isNaN(saleAmount) || saleAmount <= 0) {
 setIsSubmitting(false);
 return toast.error("Sale amount must be greater than zero.", { id: toastId });
 }

 const selectedProduct = products.find(p => p.id === quickSaleData.product_id);
 const isCatalog = !!selectedProduct;
 const isInventory = selectedProduct && selectedProduct.is_inventory_tracked;
 const qty = isCatalog ? (parseInt(quickSaleData.quantity) || 1) : 1;
 const currentStock = Number(selectedProduct?.inventory_count || 0);

 // 1. Strict Inventory Stock Validation Guardrail (for catalog items)
 if (isInventory && qty > currentStock) {
 setIsSubmitting(false);
 return toast.error(`Insufficient inventory. Requested ${qty}, but only ${currentStock} available in stock.`, { id: toastId });
 }

 // 2. Resolve permanent system "Walk-in Customer" (CUST-WALKIN)
 let walkInCustomer = customers.find(c => c.code === 'CUST-WALKIN' || c.name === 'Walk-in Customer');
 let walkInCustomerId = walkInCustomer?.id;
 if (!walkInCustomerId) {
 const { data: newWalkIn, error: walkInError } = await supabase.from('customers').insert({
 user_id: user.id,
 name: 'Walk-in Customer',
 code: 'CUST-WALKIN',
 email: 'walkin@customer.local',
 phone: '-',
 created_by_source: 'SYSTEM'
 }).select('id').single();
 if (walkInError) throw new Error(`Failed to resolve Walk-in Customer: ${walkInError.message}`);
 walkInCustomerId = newWalkIn?.id;
 }

 // 3. Create standard Invoice via create_invoice_with_lines_atomic
 const lineDescription = quickSaleData.description?.trim() || (selectedProduct ? `Quick Cash Sale: ${selectedProduct.name}` : 'Quick Cash Sale (Custom Item)');
 const { data: invoiceId, error: createError } = await supabase.rpc('create_invoice_with_lines_atomic', {
 p_user_id: user.id,
 p_customer_id: walkInCustomerId,
 p_issue_date: quickSaleData.date,
 p_due_date: quickSaleData.date,
 p_status: 'open',
 p_total_amount: saleAmount,
 p_receipt_url: null,
 p_line_items: [
 {
 product_id: selectedProduct ? selectedProduct.id : null,
 description: lineDescription,
 quantity: qty,
 unit_price: saleAmount / qty,
 total: saleAmount
 }
 ],
 p_currency_code: 'PKR',
 p_exchange_rate: 1.0,
 p_original_amount: saleAmount,
 p_created_by_source: 'MANUAL'
 });

 if (createError || !invoiceId) {
 throw new Error(createError?.message || "Failed to create invoice for cash sale");
 }

 // 4. Verify the invoice so revenue and any catalog COGS posting trigger automatically
 await supabase.from('invoices').update({ is_ai_verified: true, is_manually_edited: false }).eq('id', invoiceId);

 // 5. Immediately log full payment against the invoice routing to Cash/Bank
 const { error: payError } = await supabase.rpc('log_payment_received_atomic', {
 p_invoice_id: invoiceId,
 p_user_id: user.id,
 p_amount: saleAmount,
 p_date: quickSaleData.date,
 p_method: 'Cash'
 });

 if (payError) {
 throw new Error(`Invoice created but payment logging failed: ${payError.message}`);
 }

 // 6. Pass-Through Accounting for Custom Items with Acquisition Cost > 0
 const acqCost = (!isCatalog && quickSaleData.cost) ? parseFloat(quickSaleData.cost) : 0;
 if (acqCost > 0) {
 let cogsAcc = accounts.find(a => a.type === 'expense' && (a.name.toLowerCase().includes('cost of goods sold') || a.name.toLowerCase().includes('cogs')));
 let cogsAccId = cogsAcc?.id;
 if (!cogsAccId) {
 const { data: createdCogs } = await supabase.from('accounts').insert({
 user_id: user.id,
 name: 'Cost of Goods Sold',
 type: 'expense',
 is_system: true,
 is_cash_account: false
 }).select('id').single();
 cogsAccId = createdCogs?.id;
 }

 let cashAccId = quickSaleData.account_id;
 if (!cashAccId) {
 const cashAcc = accounts.find(a => a.is_cash_account || a.name.toLowerCase().includes('main bank') || a.name.toLowerCase().includes('petty cash') || a.name.toLowerCase().includes('cash'));
 cashAccId = cashAcc?.id;
 }

 if (cogsAccId && cashAccId) {
 const costResult = await createJournalEntryAtomic(supabase, {
 user_id: user.id,
 date: quickSaleData.date,
 description: `Acquisition cost for pass-through sale: ${lineDescription}`,
 lines: [
 { account_id: cogsAccId, debit: acqCost, credit: 0 },
 { account_id: cashAccId, debit: 0, credit: acqCost }
 ],
 created_by_source: 'MANUAL',
 reference_type: 'cogs_passthrough',
 reference_id: invoiceId
 });
 if (!costResult.success) {
 console.warn("Failed to post pass-through cost journal entry:", costResult.error);
 }
 }
 }

 toast.success(`Quick cash sale of ${saleAmount.toLocaleString()} PKR logged as Paid Invoice!`, { id: toastId });
 setIsSubmitting(false);
 setIsQuickSaleModalOpen(false);
 setQuickSaleData({
 date: new Date().toISOString().split('T')[0],
 amount: '',
 description: '',
 product_id: '',
 quantity: '1',
 cost: '',
 account_id: ''
 });
 fetchData();
 } catch (err: any) {
 toast.error(err.message || "Failed to process sale", { id: toastId });
 setIsSubmitting(false);
 }
 }

 async function handleCreateOrUpdateInvoice(e: React.FormEvent) {
 e.preventDefault();
 if (!newInvoice.customer_id || !newInvoice.amount || !newInvoice.issue_date) {
 toast.error("Please fill in all fields");
 return;
 }
 
 const toastId = toast.loading(isEditing ? "Updating Invoice..." : "Creating Invoice...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.dismiss(toastId);
 return toast.error("Not authenticated");
 }
 
 const safeAmountCents = parseToCents(newInvoice.amount);
 
 if (isEditing) {
 const currentInvoice = invoices.find(i => i.id === newInvoice.id);
 
 const { error } = await supabase.rpc('update_invoice_atomic', {
 p_invoice_id: newInvoice.id,
 p_user_id: user.id,
 p_customer_id: newInvoice.customer_id,
 p_issue_date: newInvoice.issue_date,
 p_due_date: null,
 p_status: currentInvoice?.status || 'open',
 p_total_amount: Math.round(safeAmountCents) / 100,
 p_receipt_url: currentInvoice?.receipt_url || null,
 p_line_items: [{
 product_id: null,
 description: 'Manual entry',
 quantity: 1,
 unit_price: Math.round(safeAmountCents) / 100,
 total: Math.round(safeAmountCents) / 100
 }]
 });
 
 if (error) {
 toast.error(`Error: ${error.message}`, { id: toastId });
 } else {
 try { await supabase.from('invoices').update({ is_manually_edited: true }).eq('id', newInvoice.id); } catch (_) {}
 setEditedInvoiceIds(prev => new Set(prev).add(newInvoice.id));
 toast.success("Invoice updated successfully!", { id: toastId });
 closeModal();
 fetchData();
 }
 } else {
 const { data: insertedId, error: createError } = await supabase.rpc('create_invoice_with_lines_atomic', {
 p_user_id: user.id,
 p_customer_id: newInvoice.customer_id,
 p_issue_date: newInvoice.issue_date,
 p_due_date: null,
 p_status: 'open',
 p_total_amount: Math.round(safeAmountCents) / 100,
 p_receipt_url: null,
 p_line_items: [{
 product_id: null,
 description: 'Manual entry',
 quantity: 1,
 unit_price: Math.round(safeAmountCents) / 100,
 total: Math.round(safeAmountCents) / 100
 }],
 p_currency_code: 'PKR',
 p_exchange_rate: 1.0,
 p_original_amount: Math.round(safeAmountCents) / 100
 });

  if (createError) {
    toast.error(`Error: ${createError.message}`, { id: toastId });
  } else {
    try { await supabase.from('invoices').update({ is_ai_verified: true, created_by_source: 'MANUAL', is_manually_edited: false }).eq('id', insertedId); } catch (_) {}

    // Apply Advance if toggled
    if (applyAdvanceToInvoice && insertedId) {
      const applyAmt = parseFloat(advanceAmountToApply) || 0;
      if (applyAmt > 0) {
        // 1. Try atomic RPC
        const { error: applyError } = await supabase.rpc('apply_customer_advance_atomic', {
          p_user_id: user.id,
          p_customer_id: newInvoice.customer_id,
          p_invoice_id: insertedId,
          p_amount: applyAmt,
          p_date: newInvoice.issue_date
        });

        if (!applyError) {
          toast.success(`Invoice created and ${applyAmt.toLocaleString()} PKR advance applied!`, { id: toastId });
        } else {
          // JS Fallback: Update invoice & create payment and journal entries
          const invoiceTotal = Math.round(safeAmountCents) / 100;
          const newPaid = applyAmt;
          const newBalance = Math.max(0, invoiceTotal - applyAmt);
          const newStatus = newBalance <= 0 ? 'paid' : 'partial';

          await supabase.from('invoices').update({
            amount_paid: newPaid,
            balance_due: newBalance,
            status: newStatus
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
              description: `Customer Advance Applied to Invoice ${insertedId.substring(0, 8)}`,
              lines: [
                { account_id: custAdvAcc.id, debit: applyAmt, credit: 0 },
                { account_id: arAcc.id, debit: 0, credit: applyAmt }
              ],
              created_by_source: 'MANUAL'
            });
          }
          toast.success(`Invoice created and ${applyAmt.toLocaleString()} PKR advance applied! (Status: ${newStatus.toUpperCase()})`, { id: toastId });
        }
      } else {
        toast.success("Invoice created successfully!", { id: toastId });
      }
    } else {
      toast.success("Invoice created successfully!", { id: toastId });
    }

    closeModal();
    fetchData();
  }
}
}

// --- LOG CUSTOMER ADVANCE DEPOSIT HANDLER ---
async function handleLogCustomerAdvance(e: React.FormEvent) {
  e.preventDefault();
  if (isAdvanceSubmitting) return;

  const amountNum = parseFloat(advanceData.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return toast.error("Advance amount must be greater than zero.");
  }
  if (!advanceData.customer_id) {
    return toast.error("Please select a customer.");
  }
  if (!advanceData.deposit_account_id) {
    return toast.error("Please select a deposit bank or cash account.");
  }

  setIsAdvanceSubmitting(true);
  const toastId = toast.loading("Recording customer advance deposit...");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    setIsAdvanceSubmitting(false);
    return toast.error("Not authenticated", { id: toastId });
  }

  // 1. Try atomic RPC
  const { error: rpcError } = await supabase.rpc('log_customer_advance_atomic', {
    p_user_id: user.id,
    p_customer_id: advanceData.customer_id,
    p_amount: amountNum,
    p_date: advanceData.date,
    p_method: advanceData.method,
    p_deposit_account_id: advanceData.deposit_account_id,
    p_notes: advanceData.notes || null
  });

  if (!rpcError) {
    toast.success(`Customer advance of ${amountNum.toLocaleString()} PKR recorded into Unearned Revenue!`, { id: toastId });
    setIsAdvanceSubmitting(false);
    setIsAdvanceModalOpen(false);
    setAdvanceData({
      customer_id: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      method: 'Bank Transfer',
      deposit_account_id: '',
      notes: ''
    });
    fetchData();
    return;
  }

  // Fallback if RPC not yet created
  try {
    const cust = customers.find(c => c.id === advanceData.customer_id);
    const custName = cust?.name || 'Customer';

    let custAdvAcc = accounts.find(a => a.type === 'liability' && a.name.toLowerCase().includes('customer advance'));
    let custAdvAccId = custAdvAcc?.id;
    if (!custAdvAccId) {
      const { data: newAcc } = await supabase.from('accounts').insert({
        user_id: user.id,
        name: 'Customer Advances / Unearned Revenue',
        code: '2100',
        type: 'liability',
        is_system: true
      }).select('id').single();
      custAdvAccId = newAcc?.id;
    }

    const { data: payRecord, error: payErr } = await supabase.from('payments_received').insert({
      user_id: user.id,
      invoice_id: null,
      customer_id: advanceData.customer_id,
      amount: amountNum,
      date: advanceData.date,
      payment_method: advanceData.method,
      is_advance: true,
      notes: advanceData.notes || 'Customer advance deposit'
    }).select('id').single();

    if (payErr) throw payErr;

    if (custAdvAccId) {
      await createJournalEntryAtomic(supabase, {
        user_id: user.id,
        date: advanceData.date,
        description: `Customer Advance Deposit from ${custName}`,
        lines: [
          { account_id: advanceData.deposit_account_id, debit: amountNum, credit: 0 },
          { account_id: custAdvAccId, debit: 0, credit: amountNum }
        ],
        created_by_source: 'MANUAL'
      });
    }

    toast.success(`Customer advance of ${amountNum.toLocaleString()} PKR recorded into Unearned Revenue!`, { id: toastId });
    setIsAdvanceSubmitting(false);
    setIsAdvanceModalOpen(false);
    setAdvanceData({
      customer_id: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      method: 'Bank Transfer',
      deposit_account_id: '',
      notes: ''
    });
    fetchData();
  } catch (err: any) {
    toast.error(err.message || "Failed to log advance", { id: toastId });
    setIsAdvanceSubmitting(false);
  }
}

 async function handleDeleteInvoice(id: string) {
 const inv = invoices.find(i => i.id === id);
 if (inv?.is_ai_verified) {
 toast.error("Verified invoices cannot be deleted. They are part of your permanent ledger.");
 return;
 }
 if (!window.confirm("Are you sure you want to delete this invoice? This will also remove the corresponding journal entries.")) return;
 const toastId = toast.loading("Deleting invoice...");
 const { error } = await supabase.from('invoices').delete().eq('id', id);
 if (error) {
 toast.error(`Error: ${error.message}`, { id: toastId });
 } else {
 toast.success("Invoice deleted!", { id: toastId });
 fetchData();
 }
 }

 async function handleLogPayment(e: React.FormEvent) {
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
 return toast.error(`Payment amount (${safeAmount.toLocaleString()} PKR) cannot exceed remaining balance due (${maxDue.toLocaleString()} PKR).`);
 }

 setIsSubmitting(true);
 const toastId = toast.loading("Logging payment...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 setIsSubmitting(false);
 return toast.error("Not authenticated", { id: toastId });
 }

 const { error: rpcError } = await supabase.rpc('log_payment_received_atomic', {
 p_invoice_id: paymentData.invoice_id,
 p_user_id: user.id,
 p_amount: safeAmount,
 p_date: paymentData.date,
 p_method: paymentData.method
 });

 if (!rpcError) {
 toast.success("Payment logged successfully!", { id: toastId });
 setIsSubmitting(false);
 setIsPaymentModalOpen(false);
 fetchData();
 return;
 }

 // Fallback if RPC is not deployed
 try {
 if (!invoice) throw new Error("Invoice not found");
 const currentPaid = Number(invoice.amount_paid || 0);
 const total = Number(invoice.total_amount || 0);
 const newPaid = currentPaid + safeAmount;
 const newBalance = Math.max(0, total - newPaid);
 const newStatus = newBalance <= 0 ? 'paid' : 'partial';

 await supabase
 .from('invoices')
 .update({
 balance_due: newBalance,
 amount_paid: newPaid,
 status: newStatus
 })
 .eq('id', invoice.id);

 const accountsRes = await supabase.from('accounts').select('*').eq('user_id', user.id);
 const bankAccount = accountsRes.data?.find(a => a.is_cash_account || a.name.toLowerCase().includes('bank') || a.type === 'asset');
 const arAccount = accountsRes.data?.find(a => a.name.toLowerCase().includes('accounts receivable') || a.type === 'asset');

 if (bankAccount && arAccount) {
 const { data: entry } = await supabase.from('journal_entries').insert({
 user_id: user.id,
 date: paymentData.date,
 description: `Customer payment received for Invoice INV-${invoice.id.substring(0, 6).toUpperCase()}`,
 reference_type: 'invoice_payment',
 reference_id: invoice.id
 }).select().single();

 if (entry) {
 await supabase.from('journal_lines').insert([
 { journal_entry_id: entry.id, account_id: bankAccount.id, debit: safeAmount, credit: 0 },
 { journal_entry_id: entry.id, account_id: arAccount.id, debit: 0, credit: safeAmount }
 ]);
 }
 }

 toast.success(`Logged ${safeAmount.toLocaleString()} PKR payment for Invoice!`, { id: toastId });
 setIsSubmitting(false);
 setIsPaymentModalOpen(false);
 fetchData();
 } catch (err: any) {
 toast.error(err.message || "Failed to log payment", { id: toastId });
 setIsSubmitting(false);
 }
 }

 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'verified' | 'paid'>('all');
 const [sortField, setSortField] = useState<'date' | 'amount' | 'customer' | 'id'>('date');
 const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

 function toggleSort(field: 'date' | 'amount' | 'customer' | 'id') {
 if (sortField === field) {
 setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
 } else {
 setSortField(field);
 setSortOrder('desc');
 }
 }

 const filteredInvoices = useMemo(() => {
 return invoices.filter(inv => {
 const searchLower = searchTerm.toLowerCase();
 const matchesSearch = !searchTerm || 
 inv.id?.toLowerCase().includes(searchLower) ||
 inv.customers?.name?.toLowerCase().includes(searchLower) ||
 inv.total_amount?.toString().includes(searchLower);

 let matchesStatus = true;
 if (statusFilter === 'pending') {
 matchesStatus = !inv.is_ai_verified;
 } else if (statusFilter === 'verified') {
 matchesStatus = Boolean(inv.is_ai_verified);
 } else if (statusFilter === 'paid') {
 matchesStatus = inv.status === 'paid' || inv.status === 'PAID';
 }

 return matchesSearch && matchesStatus;
 }).sort((a, b) => {
 let comparison = 0;
 if (sortField === 'date') {
 comparison = new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime();
 } else if (sortField === 'amount') {
 comparison = (a.total_amount || 0) - (b.total_amount || 0);
 } else if (sortField === 'customer') {
 comparison = (a.customers?.name || '').localeCompare(b.customers?.name || '');
 } else if (sortField === 'id') {
 comparison = (a.id || '').localeCompare(b.id || '');
 }
 return sortOrder === 'asc' ? comparison : -comparison;
 });
 }, [invoices, searchTerm, statusFilter, sortField, sortOrder]);

 const filteredCustomers = useMemo(() => {
 if (!searchTerm) return customers;
 const lower = searchTerm.toLowerCase();
 return customers.filter(c => c.name?.toLowerCase().includes(lower) || c.email?.toLowerCase().includes(lower));
 }, [customers, searchTerm]);

 const filteredProducts = useMemo(() => {
 if (!searchTerm) return products;
 const lower = searchTerm.toLowerCase();
 return products.filter(p => p.name?.toLowerCase().includes(lower));
 }, [products, searchTerm]);

 function openEditModal(inv: any) {
 setIsEditing(true);
 setNewInvoice({
 id: inv.id,
 customer_id: inv.customer_id,
 issue_date: inv.issue_date,
 amount: inv.total_amount.toString()
 });
 setIsInvoiceModalOpen(true);
 }

 function closeModal() {
 setIsInvoiceModalOpen(false);
 setIsEditing(false);
 setNewInvoice({ id: '', customer_id: '', issue_date: '', amount: '' });
 }

 return (
 <div className="space-y-6 relative min-w-0">
 
 {/* HEADER & TABS */}
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl min-w-0">
 <div>
 <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
 Revenue & Invoices Hub
 </h1>
 <p className="text-xs text-gray-500 mt-1">
 Manage your invoices, customers, and product catalogs.
 </p>
 </div>

 <div className="flex bg-gray-100 p-1 rounded-xl text-sm font-medium w-full sm:w-auto overflow-x-auto custom-scrollbar min-w-0">
 <button
 onClick={() => setActiveTab('invoices')}
 className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg transition-all cursor-pointer whitespace-nowrap ${activeTab === 'invoices' ? 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-blue-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
 >
 <FileText className="w-4 h-4" /> Invoices
 </button>
 <button
 onClick={() => setActiveTab('customers')}
 className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg transition-all cursor-pointer whitespace-nowrap ${activeTab === 'customers' ? 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-emerald-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
 >
 <Users className="w-4 h-4" /> Customers
 </button>
 <button
 onClick={() => setActiveTab('products')}
 className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg transition-all cursor-pointer whitespace-nowrap ${activeTab === 'products' ? 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-purple-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
 >
 <Package className="w-4 h-4" /> Products
 </button>
 </div>
 </div>

 {/* CONTENT AREA */}
 <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl overflow-hidden min-h-[400px] min-w-0">
 
 {/* TOOLBAR */}
 <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
 <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
 <div className="relative w-full sm:w-64">
 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input 
 type="text" 
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder={`Search ${activeTab}...`} 
 className="w-full pl-9 pr-4 py-2.5 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
 />
 </div>
 {activeTab === 'invoices' && (
 <select
 value={statusFilter}
 onChange={(e: any) => setStatusFilter(e.target.value)}
 className="w-full sm:w-auto px-3 py-2.5 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
 >
 <option value="all">All Statuses</option>
 <option value="pending">Pending Verification</option>
 <option value="verified">AI Verified</option>
 <option value="paid">Paid</option>
 </select>
 )}
 </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {activeTab === 'invoices' && (
            <>
              <button
                onClick={() => {
                  const defaultBankAcc = accounts.find(a => 
                    a.is_cash_account || 
                    a.name.toLowerCase().includes('main bank') || 
                    a.name.toLowerCase().includes('petty cash') ||
                    a.type === 'asset'
                  );
                  setAdvanceData({
                    customer_id: '',
                    amount: '',
                    date: new Date().toISOString().split('T')[0],
                    method: 'Bank Transfer',
                    deposit_account_id: defaultBankAcc?.id || '',
                    notes: ''
                  });
                  setIsAdvanceModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
              >
                <DollarSign className="w-4 h-4 font-bold" />
                + Customer Advance
              </button>

              <button
                onClick={() => {
                  const defaultCashAcc = accounts.find(a => 
                    a.is_cash_account || 
                    a.name.toLowerCase().includes('petty cash') || 
                    a.name.toLowerCase().includes('cash') || 
                    a.name.toLowerCase().includes('main bank')
                  );
                  setQuickSaleData({
                    date: new Date().toISOString().split('T')[0],
                    amount: '',
                    description: '',
                    product_id: '',
                    quantity: '1',
                    cost: '',
                    account_id: defaultCashAcc?.id || ''
                  });
                  setIsQuickSaleModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 font-bold" />
                + Quick Cash Sale
              </button>
            </>
          )}

 <button 
 onClick={() => {
 if (activeTab === 'invoices') {
 setIsEditing(false);
 setNewInvoice({ id: '', customer_id: '', issue_date: '', amount: '' });
 setApplyAdvanceToInvoice(false);
 setAdvanceAmountToApply('');
 setIsInvoiceModalOpen(true);
 } else if (activeTab === 'products') {
 setEditingProduct({ id: '', name: '', price: '0', cost: '0', is_inventory_tracked: true });
 setIsProductModalOpen(true);
 } else {
 setNewCustomer({ name: '', email: '', phone: '' });
 setIsCustomerModalOpen(true);
 }
 }}
 className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
 >
 <Plus className="w-4 h-4 font-bold" />
 New {activeTab === 'invoices' ? 'Invoice' : activeTab === 'products' ? 'Product' : 'Customer'}
 </button>
 </div>
 </div>

 {/* LISTING */}
 <div className="p-0 overflow-x-auto custom-scrollbar min-w-0">
 {isLoading ? (
 <div className="flex flex-col items-center justify-center py-20 text-blue-600">
 <Loader2 className="w-8 h-8 animate-spin" />
 </div>
 ) : (
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[850px]">
 <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
 {activeTab === 'invoices' && (
 <tr>
 <th onClick={() => toggleSort('id')} className="px-6 py-4 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
 Invoice ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
 </th>
 <th onClick={() => toggleSort('customer')} className="px-6 py-4 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
 Customer {sortField === 'customer' && (sortOrder === 'asc' ? '↑' : '↓')}
 </th>
 <th className="px-6 py-4">Items</th>
 <th onClick={() => toggleSort('date')} className="px-6 py-4 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
 Issue Date {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
 </th>
 <th onClick={() => toggleSort('amount')} className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
 Total {sortField === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
 </th>
 <th className="px-6 py-4 text-right">Paid</th>
 <th className="px-6 py-4 text-right">Balance Due</th>
 <th className="px-6 py-4 text-center">Status</th>
 <th className="px-6 py-4 text-center">AI Verified</th>
 <th className="px-6 py-4 text-right">Actions</th>
 </tr>
 )}
 {activeTab === 'customers' && (
              <tr>
                <th className="px-6 py-4">Customer ID</th>
                <th className="px-6 py-4">Name (Click for Statement)</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4 text-right">Available Advance</th>
                <th className="px-6 py-4">Added</th>
              </tr>
 )}
 {activeTab === 'products' && (
 <tr>
 <th className="px-6 py-4">Product ID</th>
 <th className="px-6 py-4">Product Name</th>
 <th className="px-6 py-4 text-right">Selling Price</th>
 <th className="px-6 py-4 text-right">Cost (COGS)</th>
 <th className="px-6 py-4 text-center">In Stock</th>
 <th className="px-6 py-4 text-center">Tracked</th>
 <th className="px-6 py-4 text-right">Actions</th>
 </tr>
 )}
 </thead>
 <tbody className="divide-y divide-gray-100 text-gray-700">
 
 {/* EMPTY STATES */}
 {activeTab === 'invoices' && filteredInvoices.length === 0 && (
 <tr>
 <td colSpan={10} className="px-6 py-16 text-center">
 <div className="flex flex-col items-center justify-center space-y-3">
 <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
 <FileText className="w-6 h-6" />
 </div>
 <p className="text-gray-500 font-medium">No invoices found</p>
 <p className="text-xs text-gray-400">Create one manually or use the AI Assistant to extract from a receipt.</p>
 </div>
 </td>
 </tr>
 )}
 {activeTab === 'customers' && filteredCustomers.length === 0 && (
 <tr>
 <td colSpan={5} className="px-6 py-16 text-center">
 <p className="text-gray-500 font-medium">No customers found</p>
 </td>
 </tr>
 )}
 {activeTab === 'products' && filteredProducts.length === 0 && (
 <tr>
 <td colSpan={7} className="px-6 py-16 text-center">
 <p className="text-gray-500 font-medium">No products found</p>
 </td>
 </tr>
 )}

 {/* DATA ROWS */}
 {activeTab === 'invoices' && filteredInvoices.map((inv) => {
 const paidAmount = Number(inv.amount_paid || (inv.total_amount - (inv.balance_due ?? 0)));
 const balanceDue = Number(inv.balance_due ?? (inv.total_amount - paidAmount));
 const isPartiallyPaid = (inv.status === 'partial' || inv.status === 'partially_paid') || (paidAmount > 0 && balanceDue > 0);
 const isFullyPaid = inv.status === 'paid' || (balanceDue <= 0 && paidAmount > 0);

 return (
 <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
 <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
 <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
 {getEntityId('INV', inv)}
 </span>
 {inv.created_by_source === 'AI' || (inv.is_ai_verified && inv.created_by_source !== 'MANUAL') ? (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
 ) : (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
 )}
 </td>
 <td className="px-6 py-4 font-semibold text-blue-700 truncate" title={inv.customers?.name}>
 <button
 onClick={() => setSelectedCustomerStatement(inv.customers?.id ? inv.customers : (customers.find(c => c.id === inv.customer_id) || inv.customers || { id: inv.customer_id, name: inv.customers?.name || 'Customer' }))}
 className="hover:underline text-blue-700 font-bold cursor-pointer text-left"
 >
 {inv.customers?.name || 'Unknown'}
 </button>
 </td>
 <td className="px-6 py-4 text-gray-700 truncate max-w-xs" title={inv.invoice_lines?.map((l: any) => l.description).join(', ')}>
 {inv.invoice_lines?.map((l: any) => l.description).join(', ') || '-'}
 </td>
 <td className="px-6 py-4 text-gray-500">
 {inv.issue_date}
 </td>
 <td className="px-6 py-4 text-right font-bold text-gray-900">
 {Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
 </td>
 <td className="px-6 py-4 text-right font-bold text-emerald-600">
 {paidAmount > 0 ? `${paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR` : '-'}
 </td>
 <td className="px-6 py-4 text-right font-bold text-gray-800">
 {balanceDue > 0 ? (
 <span className="text-rose-600 font-black">{balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
 ) : (
 <span className="text-emerald-600">0.00 PKR</span>
 )}
 </td>
 <td className="px-6 py-4 text-center">
 {isFullyPaid ? (
 <span className="px-2.5 py-1 text-[10px] font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
 PAID
 </span>
 ) : isPartiallyPaid ? (
 <span className="px-2.5 py-1 text-[10px] font-extrabold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
 PARTIALLY PAID
 </span>
 ) : inv.status === 'draft' ? (
 <span className="px-2.5 py-1 text-[10px] font-extrabold rounded-full bg-gray-100 text-gray-700 border border-gray-200">
 DRAFT
 </span>
 ) : (
 <span className="px-2.5 py-1 text-[10px] font-extrabold rounded-full bg-blue-100 text-blue-700 border border-blue-200">
 OPEN
 </span>
 )}
 </td>
 <td className="px-6 py-4 text-center">
 {inv.is_ai_verified ? (
 <span className="text-emerald-500 text-xs font-semibold flex justify-center">Yes</span>
 ) : (
 <span className="text-amber-500 text-xs font-semibold flex justify-center items-center gap-1"><AlertCircle className="w-4 h-4" /> Pending</span>
 )}
 </td>
 <td className="px-6 py-4 text-right">
 <div className="flex justify-end gap-2 items-center">
 {balanceDue > 0 && inv.status !== 'draft' && (
 <button 
 onClick={() => {
 setSelectedInvoiceForPayment(inv);
 setPaymentData(prev => ({ 
 ...prev, 
 invoice_id: inv.id, 
 amount: balanceDue.toString() 
 }));
 setIsPaymentModalOpen(true);
 }}
 className="px-3 py-2 min-h-[44px] text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1 border border-green-200"
 title="Log Payment"
 aria-label="Log Payment"
 >
 <DollarSign className="w-3.5 h-3.5" /> Pay
 </button>
 )}
 <button 
 onClick={() => openEditModal(inv)} 
 className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
 aria-label="Edit Invoice"
 title="Edit Invoice"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 <button 
 onClick={() => handleDeleteInvoice(inv.id)} 
 className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
 aria-label="Delete Invoice"
 title="Delete Invoice"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </td>
 </tr>
 );
 })}

 {activeTab === 'customers' && filteredCustomers.map((c) => {
 const isSystemCustomer = c.code === 'CUST-WALKIN' || c.name === 'Walk-in Customer';
 return (
 <tr key={c.id} className="hover:bg-gray-50 transition-colors">
 <td className="px-6 py-4">
 <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
 {getEntityId('CUST', c)}
 </span>
 </td>
 <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
 <button 
 onClick={() => setSelectedCustomerStatement(c)}
 className="hover:underline text-blue-700 font-bold cursor-pointer text-left"
 >
 {c.name}
 </button>
 {isSystemCustomer ? (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200">🔒 System Protected</span>
 ) : c.created_by_source === 'AI' ? (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
 ) : (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
 )}
 {c.is_manually_edited && !isSystemCustomer && (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">✏️ Edited</span>
 )}
 </td>
 <td className="px-6 py-4 text-gray-500">{c.email || '-'}</td>
 <td className="px-6 py-4 text-gray-500">{c.phone || '-'}</td>
 <td className="px-6 py-4 text-right">
 {getCustomerAdvanceBalance(c.id) > 0 ? (
 <span className="font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
 {getCustomerAdvanceBalance(c.id).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
 </span>
 ) : (
 <span className="text-gray-400 text-xs">-</span>
 )}
 </td>
 <td className="px-6 py-4 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
 </tr>
 );
 })}

 {activeTab === 'products' && filteredProducts.map((p) => (
 <tr key={p.id} className="hover:bg-gray-50 transition-colors">
 <td className="px-6 py-4">
 <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
 {getEntityId('PROD', p)}
 </span>
 </td>
 <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
 <span>{p.name}</span>
 {p.created_by_source === 'AI' ? (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
 ) : (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
 )}
 {p.is_manually_edited && (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">✏️ Edited</span>
 )}
 </td>
 <td className="px-6 py-4 text-gray-500 text-right font-medium">{p.currency_code || 'PKR'} {p.price.toLocaleString()}</td>
 <td className="px-6 py-4 text-gray-500 text-right font-medium">{p.currency_code || 'PKR'} {(p.cost || 0).toLocaleString()}</td>
 <td className="px-6 py-4 text-center">
 <span className={`px-2 py-1 rounded-full text-xs font-bold ${p.inventory_count > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
 {p.inventory_count || 0}
 </span>
 </td>
 <td className="px-6 py-4 text-center text-gray-500 text-xs font-semibold">
 {p.is_inventory_tracked ? 'YES' : 'NO'}
 </td>
 <td className="px-6 py-4 text-right">
 <button 
 onClick={() => openEditProductModal(p)} 
 className="p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer" 
 title="Edit Product"
 aria-label="Edit Product"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>

 </div>

 {/* CENTERED POP-UP MODAL FOR NEW/EDIT INVOICE */}
 {mounted && isInvoiceModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Invoice' : 'Create New Invoice'}</h2>
 <button onClick={closeModal} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="invoiceForm" onSubmit={handleCreateOrUpdateInvoice} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Customer</label>
 <select 
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={newInvoice.customer_id}
 onChange={e => setNewInvoice({...newInvoice, customer_id: e.target.value})}
 required
 >
 <option value="">Select a Customer</option>
 {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
 </select>
 <p className="text-[10px] text-gray-400 mt-1">If the customer is missing, add via "+ New Customer".</p>
 </div>

 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Issue Date</label>
 <input 
 type="date" 
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={newInvoice.issue_date}
 onChange={e => setNewInvoice({...newInvoice, issue_date: e.target.value})}
 required
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (PKR)</label>
 <input 
 type="number" 
 step="0.01" 
 placeholder="0.00"
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={newInvoice.amount}
 onChange={e => setNewInvoice({...newInvoice, amount: e.target.value})}
 required
 />
 </div>
 </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button type="button" onClick={closeModal} className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer text-sm">
 Cancel
 </button>
 <button type="submit" form="invoiceForm" className="px-5 py-2.5 min-h-[44px] bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 cursor-pointer text-sm">
 {isEditing ? 'Save Changes' : 'Create Invoice'}
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* LOG PAYMENT MODAL (WITH PARTIAL PAYMENT ENGINE) */}
 {mounted && isPaymentModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <div>
 <h2 className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-2">
 <DollarSign className="w-5 h-5 text-green-600 shrink-0" />
 Log Received Payment
 </h2>
 {selectedInvoiceForPayment && (
 <span className="text-xs text-gray-500 font-medium">
 Invoice: <span className="font-mono font-bold text-blue-700">{getEntityId('INV', selectedInvoiceForPayment)}</span>
 </span>
 )}
 </div>
 <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="paymentForm" onSubmit={handleLogPayment} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 
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
 
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Method</label>
 <select 
 value={paymentData.method}
 onChange={e => setPaymentData({...paymentData, method: e.target.value})}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-gray-900"
 >
 <option value="Bank Transfer">Bank Transfer (Main Bank Account)</option>
 <option value="Cash">Cash (Petty Cash)</option>
 <option value="Credit Card">Credit Card</option>
 <option value="Cheque">Cheque</option>
 </select>
 </div>
 </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button type="button" onClick={() => setIsPaymentModalOpen(false)} disabled={isSubmitting} className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50">
 Cancel
 </button>
 <button type="submit" form="paymentForm" disabled={isSubmitting} className="px-5 py-2.5 min-h-[44px] bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-green-600/20 cursor-pointer disabled:opacity-50 flex items-center justify-center">
 {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Record Payment'}
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* CUSTOMER STATEMENT MODAL */}
 {mounted && selectedCustomerStatement && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl border border-gray-100 w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 
 {/* STATEMENT HEADER */}
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <div>
 <div className="flex items-center gap-2">
 <span className="text-xs font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Customer Statement</span>
 <span className="font-mono text-xs font-bold text-gray-500">{getEntityId('CUST', selectedCustomerStatement)}</span>
 </div>
 <h2 className="text-xl font-extrabold text-gray-900 mt-1 flex items-center gap-2">
 <Users className="w-5 h-5 text-blue-600" /> {selectedCustomerStatement.name}
 </h2>
 {(selectedCustomerStatement.email || selectedCustomerStatement.phone) && (
 <p className="text-xs text-gray-500 mt-0.5">
 {selectedCustomerStatement.email} {selectedCustomerStatement.phone && `· ${selectedCustomerStatement.phone}`}
 </p>
 )}
 </div>
 <button
 onClick={() => setSelectedCustomerStatement(null)}
 className="text-gray-400 hover:text-gray-600 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
 aria-label="Close modal"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* STATEMENT CONTENT */}
 <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-white">
          {/* STATEMENT KPI CARDS */}
          {(() => {
            const custInvoices = invoices.filter(inv => inv.customer_id === selectedCustomerStatement.id || inv.customers?.name === selectedCustomerStatement.name);
            const totalInvoiced = custInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
            const totalPaid = custInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || (inv.total_amount - (inv.balance_due ?? 0))), 0);
            const outstandingBalance = Math.max(0, totalInvoiced - totalPaid);
            const availableAdvance = getCustomerAdvanceBalance(selectedCustomerStatement.id);
            const custAdvances = paymentsReceived.filter(p => p.customer_id === selectedCustomerStatement.id && p.is_advance);

            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block">Total Invoiced</span>
                    <p className="text-xl font-black text-blue-950 mt-1">{totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">Total Paid</span>
                    <p className="text-xl font-black text-emerald-950 mt-1">{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block">Outstanding (AR)</span>
                    <p className="text-xl font-black text-rose-950 mt-1">{outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                  </div>
                  <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                    <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">Available Advance</span>
                    <p className="text-xl font-black text-indigo-950 mt-1">{availableAdvance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                  </div>
                </div>

                {/* ADVANCE RECEIPTS SECTION (IF ANY) */}
                {custAdvances.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-indigo-600" /> Advance Receipts & Deposits History
                    </h3>
                    <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-xs bg-indigo-50/30">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-indigo-50/80 text-indigo-900 font-semibold border-b border-indigo-100">
                          <tr>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Method</th>
                            <th className="px-4 py-2.5">Notes / Particulars</th>
                            <th className="px-4 py-2.5 text-right">Advance Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-100/60 text-gray-700">
                          {custAdvances.map((adv) => (
                            <tr key={adv.id} className="hover:bg-indigo-50/50">
                              <td className="px-4 py-2.5 text-gray-600 font-medium">{adv.date}</td>
                              <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded bg-white text-indigo-700 font-bold border border-indigo-200 text-[10px]">{adv.payment_method || 'Bank Transfer'}</span></td>
                              <td className="px-4 py-2.5 text-gray-700">{adv.notes || 'Customer advance deposit'}</td>
                              <td className="px-4 py-2.5 text-right font-extrabold text-indigo-700">{Number(adv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button 
                    onClick={() => {
                      setSelectedCustomerStatement(null);
                      setIsAdvanceModalOpen(true);
                      setAdvanceData({ ...advanceData, customer_id: selectedCustomerStatement.id });
                    }}
                    className="text-xs font-bold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    Receive Advance
                  </button>
                </div>

                {/* TRANSACTIONS TABLE */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Invoice & Payment History</h3>
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">Invoice ID</th>
                          <th className="px-4 py-3">Issue Date</th>
                          <th className="px-4 py-3">Items / Particulars</th>
                          <th className="px-4 py-3 text-right">Invoiced Amount</th>
                          <th className="px-4 py-3 text-right">Paid Amount</th>
                          <th className="px-4 py-3 text-right">Balance Due</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700">
                        {custInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                              No invoices found for this customer.
                            </td>
                          </tr>
                        ) : (
                          custInvoices.map((inv) => {
                            const paid = Number(inv.amount_paid || (inv.total_amount - (inv.balance_due ?? 0)));
                            const due = Number(inv.balance_due ?? (inv.total_amount - paid));
                            const isPaid = inv.status === 'paid' || due <= 0;
                            const isPartial = !isPaid && paid > 0;

                            return (
                              <tr key={inv.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono font-bold text-blue-700">{getEntityId('INV', inv)}</td>
                                <td className="px-4 py-3 text-gray-500">{inv.issue_date}</td>
                                <td className="px-4 py-3 text-gray-800 truncate max-w-xs">{inv.invoice_lines?.map((l: any) => l.description).join(', ') || 'Invoice'}</td>
                                <td className="px-4 py-3 text-right font-bold text-gray-900">{Number(inv.total_amount).toLocaleString()} PKR</td>
                                <td className="px-4 py-3 text-right font-bold text-emerald-600">{paid > 0 ? `${paid.toLocaleString()} PKR` : '-'}</td>
                                <td className="px-4 py-3 text-right font-bold text-rose-600">{due > 0 ? `${due.toLocaleString()} PKR` : '0 PKR'}</td>
                                <td className="px-4 py-3 text-center">
                                  {isPaid ? (
                                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-800">PAID</span>
                                  ) : isPartial ? (
                                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-800">PARTIALLY PAID</span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-blue-100 text-blue-800">OPEN</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

 </div>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
 <button
 type="button"
 onClick={() => setSelectedCustomerStatement(null)}
 className="px-5 py-2.5 min-h-[44px] bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
 >
 Close Statement
 </button>
 </div>

 </div>
 </div>,
 document.body
 )}

 {/* EDIT PRODUCT MODAL */}
 {mounted && isProductModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <h2 className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-2">
 <Package className="w-5 h-5 text-purple-600 shrink-0" />
 Edit Product / Service Catalog
 </h2>
 <button onClick={() => setIsProductModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="productForm" onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Name</label>
 <input 
 type="text" 
 required
 value={editingProduct.name}
 onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Default Selling Price</label>
 <input 
 type="number" 
 step="0.01"
 min="0"
 required
 value={editingProduct.price}
 onChange={e => setEditingProduct({...editingProduct, price: e.target.value})}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
 />
 </div>

 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost / Standard Cost</label>
 <input 
 type="number" 
 step="0.01"
 min="0"
 required
 value={editingProduct.cost}
 onChange={e => setEditingProduct({...editingProduct, cost: e.target.value})}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
 />
 </div>
 </div>

 <div className="pt-2">
 <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors min-h-[44px]">
 <input 
 type="checkbox"
 checked={editingProduct.is_inventory_tracked}
 onChange={e => setEditingProduct({...editingProduct, is_inventory_tracked: e.target.checked})}
 className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 shrink-0"
 />
 <div>
 <span className="text-xs font-bold text-gray-900 block">Track Physical Inventory</span>
 <span className="text-[11px] text-gray-500 block">Enable to track stock counts and post 4-line COGS entries. Leave unchecked for services.</span>
 </div>
 </label>
 </div>

 <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex gap-2 items-start">
 <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
 <span>Changes here only apply to future transactions. Past verified invoices and bills remain locked to preserve ledger integrity.</span>
 </div>
 </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
 Cancel
 </button>
 <button type="submit" form="productForm" className="px-5 py-2.5 min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-purple-600/20 cursor-pointer">
 Save Product
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* NEW CUSTOMER MODAL */}
 {mounted && isCustomerModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <h2 className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-2">
 <Users className="w-5 h-5 text-blue-600 shrink-0" />
 Add New Customer
 </h2>
 <button onClick={() => setIsCustomerModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="customerForm" onSubmit={handleCreateCustomer} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer Name *</label>
 <input 
 type="text" 
 required
 value={newCustomer.name}
 onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
 placeholder="e.g. Manual Audit Corp"
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
 />
 </div>

 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Email Address</label>
 <input 
 type="email" 
 value={newCustomer.email}
 onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
 placeholder="audit@example.com"
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
 />
 </div>

 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone Number</label>
 <input 
 type="text" 
 value={newCustomer.phone}
 onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
 placeholder="+1 555-0199"
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
 />
 </div>
 </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
 Cancel
 </button>
 <button type="submit" form="customerForm" className="px-5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-blue-600/20 cursor-pointer">
 Save Customer
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* QUICK CASH SALE MODAL (WALK-IN CUSTOMER) */}
 {mounted && isQuickSaleModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 border border-gray-100">
 {/* Modal Header */}
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-teal-50 shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
 <Zap className="w-5 h-5" />
 </div>
 <div>
 <h2 className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-2">
 Quick Cash Sale
 <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
 Walk-in Customer
 </span>
 </h2>
 <p className="text-xs text-gray-500 mt-0.5">Posts directly to General Ledger without creating an invoice or customer record.</p>
 </div>
 </div>
 <button 
 onClick={() => setIsQuickSaleModalOpen(false)} 
 className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
 aria-label="Close modal"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Modal Body Form */}
 <form id="quickCashSaleForm" onSubmit={handleQuickCashSale} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Sale Date *</label>
 <input 
 type="date" 
 required
 value={quickSaleData.date}
 onChange={e => setQuickSaleData({...quickSaleData, date: e.target.value})}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-sm"
 />
 </div>

 {/* Product / Item Selector */}
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Sale Type / Item *</label>
 <select
 value={quickSaleData.product_id}
 onChange={e => {
 const prodId = e.target.value;
 const prod = products.find(p => p.id === prodId);
 if (prod) {
 const qty = parseInt(quickSaleData.quantity) || 1;
 const calculatedAmount = (Number(prod.price || 0) * qty).toString();
 setQuickSaleData({
 ...quickSaleData,
 product_id: prodId,
 amount: calculatedAmount !== '0' ? calculatedAmount : quickSaleData.amount,
 description: prod.name,
 cost: ''
 });
 } else {
 setQuickSaleData({
 ...quickSaleData,
 product_id: '',
 cost: ''
 });
 }
 }}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-sm cursor-pointer"
 >
 <option value="">✨ Custom Item / Service (Not in Catalog)</option>
 {products.map(p => (
 <option key={p.id} value={p.id}>
 📦 {p.name} {p.price ? `(${Number(p.price).toLocaleString()} PKR)` : ''} {p.is_inventory_tracked ? `[Stock: ${p.inventory_count || 0}]` : '[Service/Untracked]'}
 </option>
 ))}
 </select>
 </div>

 {!quickSaleData.product_id ? (
 <>
 {/* Custom Item Description */}
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Item Name / Description *</label>
 <input 
 type="text" 
 required
 value={quickSaleData.description}
 onChange={e => setQuickSaleData({...quickSaleData, description: e.target.value})}
 placeholder="e.g. Resold Samsung Phone, Strategy Consulting, Tuckshop Soda"
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-sm"
 />
 </div>

 {/* Custom Item Amounts: Sale Price + Acquisition Cost */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Sale Price (PKR) *</label>
 <div className="relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">PKR</span>
 <input 
 type="number" 
 step="0.01"
 min="0.01"
 required
 placeholder="0.00"
 value={quickSaleData.amount}
 onChange={e => setQuickSaleData({...quickSaleData, amount: e.target.value})}
 className="w-full pl-12 pr-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-base"
 />
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Acquisition Cost (Optional)</label>
 <div className="relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">PKR</span>
 <input 
 type="number" 
 step="0.01"
 min="0"
 placeholder="0.00 (Leave 0 for service)"
 value={quickSaleData.cost}
 onChange={e => setQuickSaleData({...quickSaleData, cost: e.target.value})}
 className="w-full pl-12 pr-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
 />
 </div>
 </div>
 </div>

 {/* Real-time Margin & Profit Calculator */}
 {(() => {
 const sale = parseFloat(quickSaleData.amount) || 0;
 const acq = parseFloat(quickSaleData.cost) || 0;
 const profit = sale - acq;
 const margin = sale > 0 ? ((profit / sale) * 100).toFixed(1) : '0.0';
 if (sale <= 0) return null;
 return (
 <div className={`p-3 rounded-xl border text-xs flex justify-between items-center ${acq > 0 ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
 <div>
 <span className="font-bold block">{acq > 0 ? '🛒 Pass-Through Flip' : '⚡ 100% Margin Service'}</span>
 <span className="text-[11px] text-gray-600">
 {acq > 0 
 ? `Sale: ${sale.toLocaleString()} PKR - Cost: ${acq.toLocaleString()} PKR`
 : `Pure service revenue without catalog inventory`}
 </span>
 </div>
 <div className="text-right">
 <span className={`font-extrabold block text-sm ${profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
 {profit >= 0 ? `+${profit.toLocaleString()} PKR` : `${profit.toLocaleString()} PKR`}
 </span>
 <span className="text-[10px] font-bold uppercase text-gray-500">{margin}% Margin</span>
 </div>
 </div>
 );
 })()}
 </>
 ) : (
 <>
 {/* Catalog Item Details */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Sale Amount (PKR) *</label>
 <div className="relative">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">PKR</span>
 <input 
 type="number" 
 step="0.01"
 min="0.01"
 required
 placeholder="0.00"
 value={quickSaleData.amount}
 onChange={e => setQuickSaleData({...quickSaleData, amount: e.target.value})}
 className="w-full pl-12 pr-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-base"
 />
 </div>
 </div>

 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity Sold</label>
 <input 
 type="number" 
 min="1"
 value={quickSaleData.quantity}
 onChange={e => {
 const newQty = e.target.value;
 const prod = products.find(p => p.id === quickSaleData.product_id);
 const qtyNum = parseInt(newQty) || 1;
 setQuickSaleData({
 ...quickSaleData,
 quantity: newQty,
 amount: prod?.price ? (Number(prod.price) * qtyNum).toString() : quickSaleData.amount
 });
 }}
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
 />
 </div>
 </div>

 {/* Catalog stock & COGS indicator */}
 {(() => {
 const prod = products.find(p => p.id === quickSaleData.product_id);
 if (!prod) return null;
 const qty = parseInt(quickSaleData.quantity) || 1;
 const cogs = Number(prod.cost || 0) * qty;
 return prod.is_inventory_tracked ? (
 <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
 <span className="font-bold text-emerald-700 block">✓ Inventory Tracked</span>
 <span className="text-[11px] text-gray-500">
 Stock: {prod.inventory_count || 0} → {Math.max(0, (prod.inventory_count || 0) - qty)} units &bull; Unit Cost: {(prod.cost || 0).toLocaleString()} PKR &bull; Total COGS: {cogs.toLocaleString()} PKR
 </span>
 </div>
 ) : (
 <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
 Non-inventory catalog service (Direct revenue).
 </div>
 );
 })()}

 {/* Description for Catalog Item */}
 <div className="space-y-1">
 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Description / Particulars</label>
 <input 
 type="text" 
 value={quickSaleData.description}
 onChange={e => setQuickSaleData({...quickSaleData, description: e.target.value})}
 placeholder="e.g. Sold cold drink / walk-in desk sale"
 className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-sm"
 />
 </div>
 </>
 )}

 {/* Deposit Account (Petty Cash / Bank) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Deposit Cash / Bank Account *</label>
                <select
                  value={quickSaleData.account_id}
                  onChange={e => setQuickSaleData({...quickSaleData, account_id: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-sm cursor-pointer"
                >
                  {accounts
                    .filter(a => a.is_cash_account || a.type === 'asset')
                    .map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type}) {acc.is_cash_account ? '⭐ Cash/Bank' : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Double Entry Notice */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex gap-2 items-start">
                <Zap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Double-Entry Accounting:</span>
                  <span>
                    Debit: <strong>Deposit Account</strong> (+ Cash) &bull; Credit: <strong>Sales Revenue</strong> (+ Income).
                    {(() => {
                      const acq = parseFloat(quickSaleData.cost) || 0;
                      if (!quickSaleData.product_id && acq > 0) {
                        return (
                          <span className="block mt-0.5 text-blue-900 font-semibold">
                            + Debit: <strong>Cost of Goods Sold</strong> ({acq.toLocaleString()} PKR) &bull; Credit: <strong>Deposit Account</strong> ({acq.toLocaleString()} PKR) [Net Cash: +{((parseFloat(quickSaleData.amount) || 0) - acq).toLocaleString()} PKR]
                          </span>
                        );
                      }
                      if (quickSaleData.product_id && products.find(p => p.id === quickSaleData.product_id)?.is_inventory_tracked) {
                        return (
                          <span className="block mt-0.5 text-emerald-800">
                            + Debit: <strong>Cost of Goods Sold</strong> (Expense) &bull; Credit: <strong>Inventory Asset</strong> (Asset).
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </span>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsQuickSaleModalOpen(false)} 
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="quickCashSaleForm" 
                disabled={isSubmitting}
                className="px-6 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Log Cash Sale
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CUSTOMER ADVANCE MODAL (UNEARNED REVENUE / DEPOSIT) */}
      {mounted && isAdvanceModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-blue-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base sm:text-lg">
                    Log Customer Advance / Deposit
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Staged to "Customer Advances / Unearned Revenue" (Liability).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="customerAdvanceForm" onSubmit={handleLogCustomerAdvance} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
              {/* CUSTOMER SELECT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Customer *
                </label>
                <select
                  required
                  value={advanceData.customer_id}
                  onChange={(e) => setAdvanceData({ ...advanceData, customer_id: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Select a Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {getCustomerAdvanceBalance(c.id) > 0 ? `(Current Advance: ${getCustomerAdvanceBalance(c.id).toLocaleString()} PKR)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* ADVANCE AMOUNT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Advance Amount (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 50000"
                  value={advanceData.amount}
                  onChange={(e) => setAdvanceData({ ...advanceData, amount: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* DEPOSIT ACCOUNT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Deposit Into (Bank / Cash Account) *
                </label>
                <select
                  required
                  value={advanceData.deposit_account_id}
                  onChange={(e) => setAdvanceData({ ...advanceData, deposit_account_id: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Select Deposit Account</option>
                  {accounts.filter(a => a.is_cash_account || a.type === 'asset').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type}) {a.is_cash_account ? '⭐ Cash/Bank' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* DATE */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Receipt Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={advanceData.date}
                    onChange={(e) => setAdvanceData({ ...advanceData, date: e.target.value })}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* METHOD */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Payment Method
                  </label>
                  <select
                    value={advanceData.method}
                    onChange={(e) => setAdvanceData({ ...advanceData, method: e.target.value })}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online Payment</option>
                  </select>
                </div>
              </div>

              {/* NOTES */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Notes / Particulars
                </label>
                <input
                  type="text"
                  placeholder="e.g. Upfront advance for upcoming project"
                  value={advanceData.notes}
                  onChange={(e) => setAdvanceData({ ...advanceData, notes: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* DOUBLE ENTRY INFO */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs">
                <span className="font-bold block">Double-Entry Accounting Entry:</span>
                <span>
                  Debit: <strong>Deposit Account</strong> (+ Asset) &bull; Credit: <strong>Customer Advances / Unearned Revenue</strong> (+ Liability).
                </span>
              </div>
            </form>

            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="customerAdvanceForm"
                disabled={isAdvanceSubmitting}
                className="px-5 py-2.5 min-h-[44px] bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-500/20 cursor-pointer text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isAdvanceSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Log Customer Advance
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
