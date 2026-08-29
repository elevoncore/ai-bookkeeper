'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, Receipt, Truck, Edit2, Trash2, Loader2, X, AlertCircle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';
import { createJournalEntryAtomic, JournalLineItem } from '@/utils/journalEntry';
import CreatableSelect from '@/components/ui/CreatableSelect';

export default function PurchasesHub() {
 const [mounted, setMounted] = useState(false);
 const [activeTab, setActiveTab] = useState<'bills' | 'suppliers'>('bills');
 const [bills, setBills] = useState<any[]>([]);
 const [suppliers, setSuppliers] = useState<any[]>([]);
 const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
 const [paymentsMade, setPaymentsMade] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
 setMounted(true);
 }, []);

 const [isBillModalOpen, setIsBillModalOpen] = useState(false);
 const [newBill, setNewBill] = useState({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '', external_reference_number: '' });
 const [isEditing, setIsEditing] = useState(false);
 
 const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
 const [selectedBillForPayment, setSelectedBillForPayment] = useState<any>(null);
 const [paymentData, setPaymentData] = useState({ bill_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer' });
 const [isSubmitting, setIsSubmitting] = useState(false);

 // Supplier Advance State
 const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
 const [advanceData, setAdvanceData] = useState({
   supplier_id: '',
   amount: '',
   date: new Date().toISOString().split('T')[0],
   method: 'Bank Transfer',
   payment_account_id: '',
   notes: ''
 });
 const [isAdvanceSubmitting, setIsAdvanceSubmitting] = useState(false);

 // Loan Repayment Modal State (Quick action in Purchases)
 const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
 const [loanAccountId, setLoanAccountId] = useState('');
 const [loanTotalAmount, setLoanTotalAmount] = useState('');
 const [loanInterestAmount, setLoanInterestAmount] = useState('');
 const [loanPaymentAccountId, setLoanPaymentAccountId] = useState('');
 const [loanDate, setLoanDate] = useState<string>(new Date().toISOString().split('T')[0]);
 const [loanDescription, setLoanDescription] = useState<string>('Loan Repayment & Interest Service');
 const [isLoanSubmitting, setIsLoanSubmitting] = useState(false);

 const [selectedSupplierStatement, setSelectedSupplierStatement] = useState<any>(null);
  const [applyAdvanceToBill, setApplyAdvanceToBill] = useState(false);
  const [advanceAmountToApply, setAdvanceAmountToApply] = useState('');
 const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
 const [newSupplier, setNewSupplier] = useState({ name: '', email: '', phone: '' });

 // Lock background scroll when any modal is open
 useEffect(() => {
 if (isBillModalOpen || isPaymentModalOpen || isSupplierModalOpen || selectedSupplierStatement || isAdvanceModalOpen || isLoanModalOpen) {
 document.body.style.overflow = 'hidden';
 } else {
 document.body.style.overflow = 'unset';
 }
 return () => {
 document.body.style.overflow = 'unset';
 };
 }, [isBillModalOpen, isPaymentModalOpen, isSupplierModalOpen, selectedSupplierStatement, isAdvanceModalOpen, isLoanModalOpen]);

 function getSupplierAdvanceBalance(supplierId: string): number {
   if (!supplierId) return 0;
   const supplierPayments = paymentsMade.filter(p => p.supplier_id === supplierId);
   const totalAdvancesPaid = supplierPayments
     .filter(p => p.is_advance)
     .reduce((sum, p) => sum + Number(p.amount || 0), 0);
   const totalAdvancesApplied = supplierPayments
     .filter(p => p.payment_method === 'advance_settlement')
     .reduce((sum, p) => sum + Number(p.amount || 0), 0);
   return Math.max(0, totalAdvancesPaid - totalAdvancesApplied);
 }

 function getEntityId(prefix: string, item: any) {
 if (item.code) return item.code;
 const idStr = item.id ? item.id.substring(0, 6).toUpperCase() : '001';
 return `${prefix}-${idStr}`;
 }

 const [editedBillIds, setEditedBillIds] = useState<Set<string>>(new Set());

 // Search & Filter States
 const [searchTerm, setSearchTerm] = useState('');
 const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'verified' | 'paid'>('all');
 const [sortField, setSortField] = useState<'date' | 'amount' | 'supplier' | 'id'>('date');
 const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

 function toggleSort(field: 'date' | 'amount' | 'supplier' | 'id') {
 if (sortField === field) {
 setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
 } else {
 setSortField(field);
 setSortOrder('desc');
 }
 }

 const filteredBills = useMemo(() => {
 return bills.filter(b => {
 const searchLower = searchTerm.toLowerCase();
 const matchesSearch = !searchTerm || 
 b.id?.toLowerCase().includes(searchLower) ||
 b.suppliers?.name?.toLowerCase().includes(searchLower) ||
 b.total_amount?.toString().includes(searchLower);

 let matchesStatus = true;
 if (statusFilter === 'pending') {
 matchesStatus = !b.is_ai_verified;
 } else if (statusFilter === 'verified') {
 matchesStatus = Boolean(b.is_ai_verified);
 } else if (statusFilter === 'paid') {
 matchesStatus = b.status === 'paid' || b.status === 'PAID';
 }

 return matchesSearch && matchesStatus;
 }).sort((a, b) => {
 let comparison = 0;
 if (sortField === 'date') {
 comparison = new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime();
 } else if (sortField === 'amount') {
 comparison = (a.total_amount || 0) - (b.total_amount || 0);
 } else if (sortField === 'supplier') {
 comparison = (a.suppliers?.name || '').localeCompare(b.suppliers?.name || '');
 } else if (sortField === 'id') {
 comparison = (a.id || '').localeCompare(b.id || '');
 }
 return sortOrder === 'asc' ? comparison : -comparison;
 });
 }, [bills, searchTerm, statusFilter, sortField, sortOrder]);

 const filteredSuppliers = useMemo(() => {
 if (!searchTerm) return suppliers;
 const lower = searchTerm.toLowerCase();
 return suppliers.filter(s => s.name?.toLowerCase().includes(lower) || s.email?.toLowerCase().includes(lower));
 }, [suppliers, searchTerm]);

 async function handleCreateSupplier(e: React.FormEvent) {
 e.preventDefault();
 if (!newSupplier.name) return toast.error("Supplier name is required");
 
 const toastId = toast.loading("Creating supplier...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.dismiss(toastId);
 return toast.error("Not authenticated");
 }

 const { error } = await supabase.from('suppliers').insert({
 user_id: user.id,
 name: newSupplier.name,
 email: newSupplier.email || null,
 phone: newSupplier.phone || null
 });

 if (error) {
 toast.error(`Error creating supplier: ${error.message}`, { id: toastId });
 } else {
 toast.success("Supplier created successfully!", { id: toastId });
 setIsSupplierModalOpen(false);
 setNewSupplier({ name: '', email: '', phone: '' });
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

    const [billsRes, suppRes, accRes, payRes] = await Promise.all([
      supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(name))').eq('user_id', user.id).order('issue_date', { ascending: false }),
      supabase.from('suppliers').select('*').eq('user_id', user.id).order('name'),
      supabase.from('accounts').select('*').eq('user_id', user.id).order('name'),
      supabase.from('payments_made').select('*').eq('user_id', user.id)
    ]);

    if (billsRes.data) setBills(billsRes.data);
    if (suppRes.data) setSuppliers(suppRes.data);
    if (accRes.data) setChartOfAccounts(accRes.data);
    if (payRes.data) setPaymentsMade(payRes.data);

    setIsLoading(false);
  }

  // --- LOG SUPPLIER ADVANCE / PREPAYMENT HANDLER ---
  async function handleLogSupplierAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (isAdvanceSubmitting) return;

    const amountNum = parseFloat(advanceData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return toast.error("Advance amount must be greater than zero.");
    }
    if (!advanceData.supplier_id) {
      return toast.error("Please select a supplier.");
    }
    if (!advanceData.payment_account_id) {
      return toast.error("Please select a bank or cash payment account.");
    }

    setIsAdvanceSubmitting(true);
    const toastId = toast.loading("Recording supplier advance prepayment...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsAdvanceSubmitting(false);
      return toast.error("Not authenticated", { id: toastId });
    }

    // 1. Try atomic RPC
    const { error: rpcError } = await supabase.rpc('log_supplier_advance_atomic', {
      p_user_id: user.id,
      p_supplier_id: advanceData.supplier_id,
      p_amount: amountNum,
      p_date: advanceData.date,
      p_method: advanceData.method,
      p_payment_account_id: advanceData.payment_account_id,
      p_notes: advanceData.notes || null
    });

    if (!rpcError) {
      toast.success(`Supplier advance of ${amountNum.toLocaleString()} PKR recorded into Prepaid Expenses!`, { id: toastId });
      setIsAdvanceSubmitting(false);
      setIsAdvanceModalOpen(false);
      setAdvanceData({
        supplier_id: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        method: 'Bank Transfer',
        payment_account_id: '',
        notes: ''
      });
      fetchData();
      return;
    }

    // Fallback if RPC not yet created
    try {
      const supp = suppliers.find(s => s.id === advanceData.supplier_id);
      const suppName = supp?.name || 'Supplier';

      let suppAdvAcc = chartOfAccounts.find(a => a.type === 'asset' && a.name.toLowerCase().includes('supplier advance'));
      let suppAdvAccId = suppAdvAcc?.id;
      if (!suppAdvAccId) {
        const { data: newAcc } = await supabase.from('accounts').insert({
          user_id: user.id,
          name: 'Supplier Advances / Prepaid Expenses',
          type: 'asset',
          is_system: true
        }).select('id').single();
        suppAdvAccId = newAcc?.id;
      }

      const { data: payRecord, error: payErr } = await supabase.from('payments_made').insert({
        user_id: user.id,
        bill_id: null,
        supplier_id: advanceData.supplier_id,
        amount: amountNum,
        date: advanceData.date,
        payment_method: advanceData.method,
        is_advance: true,
        notes: advanceData.notes || 'Supplier advance prepayment'
      }).select('id').single();

      if (payErr) throw payErr;

      if (suppAdvAccId) {
        await createJournalEntryAtomic(supabase, {
          user_id: user.id,
          date: advanceData.date,
          description: `Supplier Advance Payment to ${suppName}`,
          lines: [
            { account_id: suppAdvAccId, debit: amountNum, credit: 0 },
            { account_id: advanceData.payment_account_id, debit: 0, credit: amountNum }
          ],
          created_by_source: 'MANUAL'
        });
      }

      toast.success(`Supplier advance of ${amountNum.toLocaleString()} PKR recorded into Prepaid Expenses!`, { id: toastId });
      setIsAdvanceSubmitting(false);
      setIsAdvanceModalOpen(false);
      setAdvanceData({
        supplier_id: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        method: 'Bank Transfer',
        payment_account_id: '',
        notes: ''
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to log supplier advance", { id: toastId });
      setIsAdvanceSubmitting(false);
    }
  }

  // --- RECORD LOAN PAYMENT & INTEREST SPLIT HANDLER (FROM PURCHASES HUB) ---
  async function handleRecordLoanPayment(e: React.FormEvent) {
    e.preventDefault();
    if (isLoanSubmitting) return;

    const total = parseFloat(loanTotalAmount);
    const interest = parseFloat(loanInterestAmount || '0');

    if (isNaN(total) || total <= 0) {
      return toast.error("Total payment amount must be greater than zero.");
    }
    if (isNaN(interest) || interest < 0) {
      return toast.error("Interest amount cannot be negative.");
    }
    if (interest > total) {
      return toast.error("Interest fee cannot exceed total payment amount.");
    }
    if (!loanAccountId) {
      return toast.error("Please select a Loan / Liability account.");
    }
    if (!loanPaymentAccountId) {
      return toast.error("Please select a Cash / Bank payment source.");
    }

    const principal = total - interest;
    setIsLoanSubmitting(true);
    const toastId = toast.loading("Recording loan payment & interest split...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoanSubmitting(false);
      return toast.error("Not authenticated", { id: toastId });
    }

    // 1. Try atomic RPC
    const { error: rpcError } = await supabase.rpc('record_loan_payment_atomic', {
      p_user_id: user.id,
      p_loan_account_id: loanAccountId,
      p_total_amount: total,
      p_interest_amount: interest,
      p_payment_account_id: loanPaymentAccountId,
      p_date: loanDate,
      p_description: loanDescription || 'Loan Repayment & Interest Service'
    });

    if (!rpcError) {
      toast.success(`Loan payment of ${total.toLocaleString()} PKR (Principal: ${principal.toLocaleString()} PKR, Interest: ${interest.toLocaleString()} PKR) posted to Ledger!`, { id: toastId });
      setIsLoanSubmitting(false);
      setIsLoanModalOpen(false);
      setLoanTotalAmount('');
      setLoanInterestAmount('');
      fetchData();
      return;
    }

    // Fallback if RPC not yet run in SQL Editor
    try {
      const interestAcc = chartOfAccounts.find(a => a.type === 'expense' && (a.name.toLowerCase().includes('interest') || a.name.toLowerCase().includes('finance')));
      let interestAccId = interestAcc?.id;
      if (!interestAccId) {
        const { data: newAcc } = await supabase.from('accounts').insert({
          user_id: user.id,
          name: 'Interest Expense',
          type: 'expense',
          is_system: true
        }).select('id').single();
        interestAccId = newAcc?.id;
      }

      const lines: JournalLineItem[] = [];
      if (principal > 0) {
        lines.push({ account_id: loanAccountId, debit: principal, credit: 0 });
      }
      if (interest > 0 && interestAccId) {
        lines.push({ account_id: interestAccId, debit: interest, credit: 0 });
      }
      lines.push({ account_id: loanPaymentAccountId, debit: 0, credit: total });

      const result = await createJournalEntryAtomic(supabase, {
        user_id: user.id,
        date: loanDate,
        description: loanDescription || 'Loan Repayment & Interest Service',
        lines,
        created_by_source: 'MANUAL'
      });

      if (result.error) throw new Error(result.error);

      toast.success(`Loan payment of ${total.toLocaleString()} PKR posted! Principal: ${principal.toLocaleString()} PKR, Interest: ${interest.toLocaleString()} PKR`, { id: toastId });
      setIsLoanSubmitting(false);
      setIsLoanModalOpen(false);
      setLoanTotalAmount('');
      setLoanInterestAmount('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to record loan payment", { id: toastId });
      setIsLoanSubmitting(false);
    }
  }

 async function handleSaveBill(e: React.FormEvent) {
 e.preventDefault();
 if (!newBill.supplier_id || !newBill.issue_date || !newBill.amount) {
 return toast.error("Please fill in all required fields.");
 }

 const numericAmount = parseFloat(newBill.amount);
 if (isNaN(numericAmount) || numericAmount <= 0) {
 return toast.error("Please enter a valid positive amount.");
 }

 setIsSubmitting(true);
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.error("User not authenticated.");
 setIsSubmitting(false);
 return;
 }

 try {
 const extRef = newBill.external_reference_number?.trim() || null;
 if (isEditing && newBill.id) {
 const { error: billError } = await supabase
 .from('bills')
 .update({
 supplier_id: newBill.supplier_id,
 issue_date: newBill.issue_date,
 total_amount: numericAmount,
 balance_due: numericAmount,
 external_reference_number: extRef,
 is_manually_edited: true,
 updated_at: new Date().toISOString()
 })
 .eq('id', newBill.id)
 .eq('user_id', user.id);

 if (billError) throw billError;

 if (newBill.account_id) {
 const { error: lineError } = await supabase
 .from('bill_lines')
 .update({
 account_id: newBill.account_id,
 total: numericAmount
 })
 .eq('bill_id', newBill.id);
 if (lineError) console.warn("Failed to update bill_lines account:", lineError);
 }

 setEditedBillIds(prev => new Set(prev).add(newBill.id));
 toast.success("Bill updated successfully!");
 closeModal();
 fetchData();
 } else {
      const applyAmt = applyAdvanceToBill ? parseFloat(advanceAmountToApply) || 0 : 0;
      const initialBalance = Math.max(0, numericAmount - applyAmt);
      const initialStatus = initialBalance <= 0 ? 'paid' : (applyAmt > 0 ? 'partial' : 'unpaid');

      const { data: createdBill, error: billError } = await supabase
        .from('bills')
        .insert({
          user_id: user.id,
          supplier_id: newBill.supplier_id,
          issue_date: newBill.issue_date,
          total_amount: numericAmount,
          balance_due: initialBalance,
          amount_paid: applyAmt,
          external_reference_number: extRef,
          status: initialStatus,
          is_ai_verified: false,
          created_by_source: 'MANUAL'
        })
        .select()
        .single();

      if (billError) throw billError;

      let targetAccountId = newBill.account_id;
      if (!targetAccountId) {
        const expAccount = chartOfAccounts.find(a => a.type === 'expense' || a.name.toLowerCase().includes('expense'));
        targetAccountId = expAccount?.id || null;
      }

      if (targetAccountId && createdBill) {
        await supabase.from('bill_lines').insert({
          bill_id: createdBill.id,
          account_id: targetAccountId,
          description: "Manual expense bill",
          quantity: 1,
          unit_price: numericAmount,
          total: numericAmount
        });
      }

      // Verify manual bill immediately to post the base entry: Debit Expense, Credit A/P
      try {
        await supabase.from('bills').update({ is_ai_verified: true }).eq('id', createdBill.id);
      } catch (_) {}

      // If an advance was applied, record the settlement and post the adjustment journal entry
      if (applyAmt > 0 && createdBill) {
        // 1. Insert settlement payment record
        await supabase.from('payments_made').insert({
          user_id: user.id,
          bill_id: createdBill.id,
          supplier_id: newBill.supplier_id,
          amount: applyAmt,
          date: newBill.issue_date,
          payment_method: 'advance_settlement',
          is_advance: false,
          notes: 'Settled from Supplier Advance prepayment'
        });

        // 2. Post adjusting double-entry journal entry: Debit A/P, Credit Supplier Advances
        const apAcc = chartOfAccounts.find(a => a.type === 'liability' && a.name.toLowerCase().includes('payable'));
        const suppAdvAcc = chartOfAccounts.find(a => a.type === 'asset' && a.name.toLowerCase().includes('supplier advance'));

        if (apAcc && suppAdvAcc) {
          await createJournalEntryAtomic(supabase, {
            user_id: user.id,
            date: newBill.issue_date,
            description: `Supplier Advance Applied to Bill ${createdBill.id.substring(0, 8)}`,
            lines: [
              { account_id: apAcc.id, debit: applyAmt, credit: 0 },
              { account_id: suppAdvAcc.id, debit: 0, credit: applyAmt }
            ],
            created_by_source: 'MANUAL'
          });
        }
      }

      toast.success("Bill created successfully!");
    }

 closeModal();
 fetchData();
 } catch (err: any) {
 console.error("Failed to save bill:", err);
 toast.error(`Error saving bill: ${err.message || err}`);
 } finally {
 setIsSubmitting(false);
 }
 }

 async function handleLogPayment(e: React.FormEvent) {
 e.preventDefault();
 if (isSubmitting) return;
 if (!paymentData.amount || !paymentData.date) return toast.error("Please fill in all fields");

 const payAmount = parseFloat(paymentData.amount);
 if (isNaN(payAmount) || payAmount <= 0) {
 return toast.error("Invalid payment amount. Amount must be greater than zero.");
 }

 const safeAmount = Math.round(parseToCents(paymentData.amount)) / 100;
 const bill = selectedBillForPayment || bills.find(b => b.id === paymentData.bill_id);
 const maxDue = bill?.balance_due != null ? Number(bill.balance_due) : Number(bill?.total_amount || 0);

 if (maxDue > 0 && safeAmount > maxDue) {
 return toast.error(`Payment amount (${safeAmount.toLocaleString()} PKR) cannot exceed remaining balance due (${maxDue.toLocaleString()} PKR).`);
 }

 setIsSubmitting(true);
 const toastId = toast.loading("Logging vendor payment...");
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.error("Not authenticated", { id: toastId });
 setIsSubmitting(false);
 return;
 }

 const { error: rpcError } = await supabase.rpc('log_payment_made_atomic', {
 p_bill_id: paymentData.bill_id,
 p_user_id: user.id,
 p_amount: safeAmount,
 p_date: paymentData.date,
 p_method: paymentData.method
 });

 if (!rpcError) {
 toast.success("Vendor payment logged successfully!", { id: toastId });
 setIsSubmitting(false);
 setIsPaymentModalOpen(false);
 fetchData();
 return;
 }

 // Fallback if RPC not yet run in SQL Editor
 try {
 const { data: bill } = await supabase
 .from('bills')
 .select('*')
 .eq('id', paymentData.bill_id)
 .single();

 if (!bill) throw new Error("Bill not found");

 const currentPaid = Number(bill.amount_paid || (bill.total_amount - (bill.balance_due ?? 0)));
 const newPaid = currentPaid + safeAmount;
 const newBalance = Math.max(0, Number(bill.balance_due ?? bill.total_amount) - safeAmount);
 const newStatus = newBalance === 0 ? 'paid' : 'partial';

 await supabase
 .from('bills')
 .update({
 balance_due: newBalance,
 amount_paid: newPaid,
 status: newStatus
 })
 .eq('id', bill.id);

 const accountsRes = await supabase.from('accounts').select('*').eq('user_id', user.id);
 const bankAccount = accountsRes.data?.find(a => a.is_cash_account || a.name.toLowerCase().includes('bank') || a.type === 'asset');
 const apAccount = accountsRes.data?.find(a => a.name.toLowerCase().includes('accounts payable') || a.type === 'liability');

 if (bankAccount && apAccount) {
 const { data: entry } = await supabase.from('journal_entries').insert({
 user_id: user.id,
 date: paymentData.date,
 description: `Vendor payment for Bill BILL-${bill.id.substring(0, 6).toUpperCase()}`,
 reference_type: 'bill_payment',
 reference_id: bill.id
 }).select().single();

 if (entry) {
 await supabase.from('journal_lines').insert([
 { journal_entry_id: entry.id, account_id: apAccount.id, debit: safeAmount, credit: 0 },
 { journal_entry_id: entry.id, account_id: bankAccount.id, debit: 0, credit: safeAmount }
 ]);
 }
 }

 toast.success(`Logged ${safeAmount.toLocaleString()} PKR payment for Bill!`, { id: toastId });
 setIsSubmitting(false);
 setIsPaymentModalOpen(false);
 fetchData();
 } catch (err: any) {
 toast.error(err.message || "Failed to log payment", { id: toastId });
 setIsSubmitting(false);
 }
 }

 async function handleDeleteBill(id: string) {
 if (!confirm("Are you sure you want to delete this bill?")) return;
 const { error } = await supabase.from('bills').delete().eq('id', id);
 if (error) {
 toast.error(`Failed to delete bill: ${error.message}`);
 } else {
 toast.success("Bill deleted.");
 fetchData();
 }
 }

 function openEditModal(bill: any) {
 setIsEditing(true);
 setNewBill({
 id: bill.id,
 supplier_id: bill.supplier_id,
 account_id: bill.bill_lines?.[0]?.account_id || '',
 issue_date: bill.issue_date,
 amount: bill.total_amount.toString(),
 external_reference_number: bill.external_reference_number || ''
 });
 setIsBillModalOpen(true);
 }

 function closeModal() {
    setIsBillModalOpen(false);
    setIsEditing(false);
    setNewBill({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '', external_reference_number: '' });
    setApplyAdvanceToBill(false);
    setAdvanceAmountToApply('');
  }

 async function handleSaveSupplier(e: React.FormEvent) {
 e.preventDefault();
 if (!newSupplier.name) return toast.error("Supplier name is required.");
 setIsSubmitting(true);
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 setIsSubmitting(false);
 return toast.error("Not authenticated");
 }
 const { data, error } = await supabase.from('suppliers').insert({
 user_id: user.id,
 name: newSupplier.name.trim(),
 email: newSupplier.email?.trim() || null,
 phone: newSupplier.phone?.trim() || null,
 created_by_source: 'MANUAL'
 }).select().single();

 if (error) {
 toast.error(error.message);
 } else {
 toast.success("Supplier created successfully!");
 setIsSupplierModalOpen(false);
 setNewSupplier({ name: '', email: '', phone: '' });
 fetchData();
 if (data) {
 setNewBill(prev => ({ ...prev, supplier_id: data.id }));
 }
 }
 setIsSubmitting(false);
 }

 return (
 <div className="space-y-6">
 {/* TOP STATS & NAVIGATION */}
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-xs">
 <div>
 <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
 <Receipt className="w-6 h-6 text-indigo-600 shrink-0" />
 Purchases & Bills Hub
 </h1>
 <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage vendor bills, expenses, and track accounts payable balances.</p>
 </div>

 {/* TAB BUTTONS */}
 <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
 <button
 onClick={() => setActiveTab('bills')}
 className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
 activeTab === 'bills' ? 'bg-white text-indigo-600 shadow-xs' : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 <Receipt className="w-4 h-4" /> Bills ({bills.length})
 </button>
 <button
 onClick={() => setActiveTab('suppliers')}
 className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
 activeTab === 'suppliers' ? 'bg-white text-indigo-600 shadow-xs' : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 <Truck className="w-4 h-4" /> Suppliers ({suppliers.length})
 </button>
 </div>
 </div>

 {/* SEARCH AND FILTERS */}
 <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between gap-4">
 <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-1 max-w-xl">
 <div className="relative flex-1">
 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input 
 type="text" 
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder={`Search ${activeTab}...`} 
 className="w-full pl-9 pr-4 py-2.5 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
 />
 </div>
 {activeTab === 'bills' && (
 <select
 value={statusFilter}
 onChange={(e: any) => setStatusFilter(e.target.value)}
 className="w-full sm:w-auto px-3 py-2.5 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer"
 >
 <option value="all">All Statuses</option>
 <option value="pending">Pending Verification</option>
 <option value="verified">AI Verified</option>
 <option value="paid">Paid</option>
 </select>
 )}
 </div>
 
 <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {activeTab === 'bills' && (
            <>
              <button
                onClick={() => {
                  const defaultCashAcc = chartOfAccounts.find(a => 
                    a.is_cash_account || 
                    a.name.toLowerCase().includes('main bank') || 
                    a.name.toLowerCase().includes('petty cash')
                  );
                  setAdvanceData({
                    supplier_id: '',
                    amount: '',
                    date: new Date().toISOString().split('T')[0],
                    method: 'Bank Transfer',
                    payment_account_id: defaultCashAcc?.id || '',
                    notes: ''
                  });
                  setIsAdvanceModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
              >
                <DollarSign className="w-4 h-4 font-bold" />
                + Supplier Advance
              </button>

              <button
                onClick={() => {
                  const defaultLoanAcc = chartOfAccounts.find(a => 
                    a.type === 'liability' && (
                      a.name.toLowerCase().includes('loan') || 
                      a.name.toLowerCase().includes('credit') ||
                      a.name.toLowerCase().includes('mortgage') ||
                      a.name.toLowerCase().includes('payable')
                    )
                  );
                  const defaultBankAcc = chartOfAccounts.find(a => 
                    a.is_cash_account || 
                    a.name.toLowerCase().includes('main bank') || 
                    a.name.toLowerCase().includes('petty cash') ||
                    a.type === 'asset'
                  );
                  setLoanAccountId(defaultLoanAcc?.id || '');
                  setLoanPaymentAccountId(defaultBankAcc?.id || '');
                  setLoanTotalAmount('');
                  setLoanInterestAmount('');
                  setLoanDate(new Date().toISOString().split('T')[0]);
                  setLoanDescription('Loan Repayment & Interest Service');
                  setIsLoanModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Receipt className="w-4 h-4 font-bold" />
                Record Loan Payment
              </button>
            </>
          )}

          <button 
            onClick={() => {
              if (activeTab === 'bills') {
                setIsEditing(false);
                setNewBill({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '', external_reference_number: '' });
                setIsBillModalOpen(true);
              } else {
                setNewSupplier({ name: '', email: '', phone: '' });
                setIsSupplierModalOpen(true);
              }
            }}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-gray-900/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 font-bold" />
            New {activeTab === 'bills' ? 'Bill' : 'Supplier'}
          </button>
        </div>
 </div>

 {/* LISTING */}
 <div className="p-0 overflow-x-auto custom-scrollbar min-w-0">
 {isLoading ? (
 <div className="flex flex-col items-center justify-center py-20 text-indigo-600">
 <Loader2 className="w-8 h-8 animate-spin" />
 </div>
 ) : (
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[850px]">
 <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
 {activeTab === 'bills' && (
 <tr>
 <th onClick={() => toggleSort('id')} className="px-6 py-4 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
 Bill ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
 </th>
 <th onClick={() => toggleSort('supplier')} className="px-6 py-4 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
 Supplier {sortField === 'supplier' && (sortOrder === 'asc' ? '↑' : '↓')}
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
 {activeTab === 'suppliers' && (
 <tr>
 <th className="px-6 py-4">Supplier ID</th>
 <th className="px-6 py-4">Name (Click for Statement)</th>
 <th className="px-6 py-4">Email</th>
 <th className="px-6 py-4">Phone</th>
 <th className="px-6 py-4 text-right">Available Advance</th>
 <th className="px-6 py-4">Added</th>
 </tr>
 )}
 </thead>
 <tbody className="divide-y divide-gray-100 text-gray-700">
 
 {/* EMPTY STATES */}
 {activeTab === 'bills' && filteredBills.length === 0 && (
 <tr>
 <td colSpan={10} className="px-6 py-16 text-center">
 <div className="flex flex-col items-center justify-center space-y-3">
 <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500">
 <Receipt className="w-6 h-6" />
 </div>
 <p className="text-gray-500 font-medium">No bills found</p>
 </div>
 </td>
 </tr>
 )}
 {activeTab === 'suppliers' && filteredSuppliers.length === 0 && (
 <tr>
 <td colSpan={5} className="px-6 py-16 text-center">
 <div className="flex flex-col items-center justify-center space-y-3">
 <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
 <Truck className="w-6 h-6" />
 </div>
 <p className="text-gray-500 font-medium">No suppliers found</p>
 <p className="text-xs text-gray-400">Suppliers are automatically created when the AI logs a new bill.</p>
 </div>
 </td>
 </tr>
 )}

 {/* DATA ROWS */}
 {activeTab === 'bills' && filteredBills.map((bill) => {
 const paidAmount = Number(bill.amount_paid || (bill.total_amount - (bill.balance_due ?? 0)));
 const balanceDue = Number(bill.balance_due ?? (bill.total_amount - paidAmount));
 const isPartiallyPaid = (bill.status === 'partial' || bill.status === 'partially_paid') || (paidAmount > 0 && balanceDue > 0);
 const isFullyPaid = bill.status === 'paid' || (balanceDue <= 0 && paidAmount > 0);

 return (
 <tr key={bill.id} className="hover:bg-gray-50 transition-colors group">
 <td className="px-6 py-4 font-medium text-gray-900">
 <div className="flex items-center gap-2">
 <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
 {getEntityId('BILL', bill)}
 </span>
 {bill.created_by_source === 'AI' || (bill.is_ai_verified && bill.created_by_source !== 'MANUAL') ? (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
 ) : (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
 )}
 </div>
 {bill.external_reference_number && (
 <div className="mt-1">
 <span className="font-mono text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
 Ref: {bill.external_reference_number}
 </span>
 </div>
 )}
 </td>
 <td className="px-6 py-4 font-semibold text-indigo-700 truncate" title={bill.suppliers?.name}>
 <button
 onClick={() => setSelectedSupplierStatement(bill.suppliers || { id: bill.supplier_id, name: 'Supplier' })}
 className="hover:underline text-indigo-700 font-bold cursor-pointer text-left"
 >
 {bill.suppliers?.name || 'Unknown'}
 </button>
 </td>
 <td className="px-6 py-4 text-gray-700 truncate max-w-xs" title={bill.bill_lines?.map((l: any) => l.description).join(', ')}>
 {bill.bill_lines?.map((l: any) => l.description).join(', ') || '-'}
 </td>
 <td className="px-6 py-4 text-gray-500">
 {bill.issue_date}
 </td>
 <td className="px-6 py-4 text-right font-bold text-gray-900">
 {Number(bill.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
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
 ) : bill.status === 'draft' ? (
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
 {bill.is_ai_verified ? (
 <span className="text-emerald-500 text-xs font-semibold flex justify-center">Yes</span>
 ) : (
 <span className="text-amber-500 text-xs font-semibold flex justify-center items-center gap-1"><AlertCircle className="w-4 h-4" /> Pending</span>
 )}
 </td>
 <td className="px-6 py-4 text-right">
 <div className="flex justify-end gap-2 items-center">
 {balanceDue > 0 && bill.status !== 'draft' && (
 <button 
 onClick={() => {
 setSelectedBillForPayment(bill);
 setPaymentData(prev => ({ 
 ...prev, 
 bill_id: bill.id, 
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
 onClick={() => openEditModal(bill)} 
 className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
 aria-label="Edit Bill"
 title="Edit Bill"
 >
 <Edit2 className="w-4 h-4" />
 </button>
 <button 
 onClick={() => handleDeleteBill(bill.id)} 
 className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
 aria-label="Delete Bill"
 title="Delete Bill"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </td>
 </tr>
 );
 })}

 {activeTab === 'suppliers' && filteredSuppliers.map((c) => (
 <tr key={c.id} className="hover:bg-gray-50 transition-colors">
 <td className="px-6 py-4">
 <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
 {getEntityId('SUPP', c)}
 </span>
 </td>
 <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
 <button
 onClick={() => setSelectedSupplierStatement(c)}
 className="hover:underline text-indigo-700 font-bold cursor-pointer text-left"
 >
 {c.name}
 </button>
 {c.created_by_source === 'AI' ? (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
 ) : (
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
 )}
 </td>
 <td className="px-6 py-4 text-gray-500 font-mono text-xs">{c.email || '-'}</td>
 <td className="px-6 py-4 text-gray-500 text-xs">{c.phone || '-'}</td>
 <td className="px-6 py-4 text-right">
 {getSupplierAdvanceBalance(c.id) > 0 ? (
 <span className="font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
 {getSupplierAdvanceBalance(c.id).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
 </span>
 ) : (
 <span className="text-gray-400 text-xs">-</span>
 )}
 </td>
 <td className="px-6 py-4 text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>

 </div>

 {/* CREATE / EDIT BILL MODAL (WITH EXTERNAL REFERENCE NUMBER) */}
 {mounted && isBillModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
 <Receipt className="w-5 h-5 text-indigo-600" />
 {isEditing ? 'Edit Bill / Purchase' : 'Create New Bill / Expense'}
 </h2>
 <button onClick={closeModal} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="billForm" onSubmit={handleSaveBill} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Vendor / Supplier *</label>
 <CreatableSelect
   options={suppliers}
   value={newBill.supplier_id}
   onChange={(id) => setNewBill({ ...newBill, supplier_id: id })}
   onCreateNew={async (name) => {
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) return null;
     const { data, error } = await supabase
       .from('suppliers')
       .insert({ user_id: user.id, name, created_by_source: 'MANUAL' })
       .select('*')
       .single();
     if (error) {
       toast.error(`Failed to create supplier: ${error.message}`);
       return null;
     }
     toast.success(`Supplier "${name}" created!`);
     setSuppliers(prev => [...prev, data]);
     return data;
   }}
   placeholder="Select or type to create supplier..."
   entityType="supplier"
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Expense / Asset Category</label>
 <select 
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
 value={newBill.account_id}
 onChange={e => setNewBill({...newBill, account_id: e.target.value})}
 >
 <option value="">Default Expense Category</option>
 {chartOfAccounts.filter(a => a.type === 'expense' || a.type === 'asset').map(a => (
 <option key={a.id} value={a.id}>{a.name} ({a.type.toUpperCase()})</option>
 ))}
 </select>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Issue Date *</label>
 <input 
 type="date" 
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
 value={newBill.issue_date}
 onChange={e => setNewBill({...newBill, issue_date: e.target.value})}
 required
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (PKR) *</label>
 <input 
 type="number" 
 step="0.01" 
 placeholder="0.00"
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
 value={newBill.amount}
 onChange={e => setNewBill({...newBill, amount: e.target.value})}
 required
 />
 </div>
 </div>

 {/* EXTERNAL REFERENCE NUMBER INPUT */}
 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">
 Vendor Invoice / Receipt # <span className="text-gray-400 font-normal">(External Reference)</span>
 </label>
 <input 
 type="text" 
 placeholder="e.g. REF-9942, INV-2024-001, REC-8491"
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
 value={newBill.external_reference_number}
 onChange={e => setNewBill({...newBill, external_reference_number: e.target.value})}
 />
 <p className="text-[11px] text-gray-400 mt-1">Preserves the vendor&apos;s original receipt number for audits and tax records.</p>
        </div>

        {/* APPLY ADVANCE BANNER (NEW BILL ONLY) */}
        {!isEditing && newBill.supplier_id && (() => {
          const availableAdvance = getSupplierAdvanceBalance(newBill.supplier_id);
          if (availableAdvance <= 0) return null;
          const billAmt = parseFloat(newBill.amount) || 0;
          const applyAmt = parseFloat(advanceAmountToApply) || 0;
          const maxApplicable = Math.min(availableAdvance, billAmt || availableAdvance);

          return (
            <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl space-y-3 mt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <DollarSign className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-black text-purple-950 uppercase tracking-wider block">
                      Supplier Advance Available: {availableAdvance.toLocaleString()} PKR
                    </span>
                    <span className="text-[11px] text-purple-700 font-medium block mt-0.5">
                      This supplier owes you goods/services worth {availableAdvance.toLocaleString()} PKR. Apply this prepayment to deduct from bill total.
                    </span>
                  </div>
                </div>
                {!applyAdvanceToBill ? (
                  <button
                    type="button"
                    onClick={() => {
                      setApplyAdvanceToBill(true);
                      setAdvanceAmountToApply(maxApplicable.toString());
                    }}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                  >
                    ⚡ Apply {maxApplicable.toLocaleString()} PKR Advance
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setApplyAdvanceToBill(false);
                      setAdvanceAmountToApply('');
                    }}
                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer"
                  >
                    Remove Advance
                  </button>
                )}
              </div>

              {applyAdvanceToBill && (
                <div className="pt-3 border-t border-purple-200 space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="block text-[11px] font-bold text-purple-900 uppercase">
                      Amount to Deduct (PKR):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      max={maxApplicable}
                      value={advanceAmountToApply}
                      onChange={(e) => setAdvanceAmountToApply(e.target.value)}
                      placeholder={`Max: ${maxApplicable.toLocaleString()}`}
                      className="w-44 border border-purple-300 bg-white rounded-lg px-3 py-1.5 text-xs font-black text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  {billAmt > 0 && applyAmt > 0 && (
                    <div className="p-2.5 bg-white rounded-lg border border-purple-100 text-xs text-purple-950 font-bold flex justify-between">
                      <span>Bill Total: {billAmt.toLocaleString()} PKR &minus; Advance Applied: {applyAmt.toLocaleString()} PKR</span>
                      <span className="text-emerald-700 font-extrabold">
                        {applyAmt >= billAmt ? "✓ Fully Covered (PAID)" : `Net Balance Due: ${(billAmt - applyAmt).toLocaleString()} PKR`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button type="button" onClick={closeModal} className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer text-sm">
 Cancel
 </button>
 <button 
 type="submit" 
 form="billForm"
 disabled={isSubmitting} 
 className="px-5 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all cursor-pointer text-sm shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
 >
 {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
 {isEditing ? 'Save Changes' : 'Create Bill'}
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* CREATE SUPPLIER MODAL */}
 {mounted && isSupplierModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-lg max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
 <Truck className="w-5 h-5 text-indigo-600" /> Add New Supplier
 </h2>
 <button onClick={() => setIsSupplierModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="supplierForm" onSubmit={handleSaveSupplier} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Supplier / Vendor Name *</label>
 <input 
 type="text" 
 placeholder="e.g. Acme Office Supplies"
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
 value={newSupplier.name}
 onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
 required
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
 <input 
 type="email" 
 placeholder="vendor@company.com"
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
 value={newSupplier.email}
 onChange={e => setNewSupplier({...newSupplier, email: e.target.value})}
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-gray-700 mb-1">Phone</label>
 <input 
 type="tel" 
 placeholder="+92 300 1234567"
 className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
 value={newSupplier.phone}
 onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
 />
 </div>
 </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer text-sm">
 Cancel
 </button>
 <button 
 type="submit" 
 form="supplierForm"
 disabled={isSubmitting} 
 className="px-5 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all cursor-pointer text-sm shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
 >
 {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
 Add Supplier
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* MODAL FOR LOG PAYMENT (WITH PARTIAL PAYMENT ENGINE) */}
 {mounted && isPaymentModalOpen && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <div>
 <h3 className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-2">
 <DollarSign className="w-5 h-5 text-green-600" /> Log Vendor Payment
 </h3>
 {selectedBillForPayment && (
 <span className="text-xs text-gray-500 font-medium">
 Bill: <span className="font-mono font-bold text-indigo-700">{getEntityId('BILL', selectedBillForPayment)}</span>
 </span>
 )}
 </div>
 <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
 <X className="w-5 h-5" />
 </button>
 </div>
 
 <form id="paymentForm" onSubmit={handleLogPayment} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
 {/* BILL FINANCIAL SUMMARY BREAKDOWN */}
 {selectedBillForPayment && (
 <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
 <div>
 <span className="text-gray-500 block text-[10px] uppercase font-bold">Total Billed</span>
 <span className="font-extrabold text-gray-900">{Number(selectedBillForPayment.total_amount).toLocaleString()} PKR</span>
 </div>
 <div>
 <span className="text-gray-500 block text-[10px] uppercase font-bold">Already Paid</span>
 <span className="font-extrabold text-emerald-700">
 {Number(selectedBillForPayment.amount_paid || (selectedBillForPayment.total_amount - (selectedBillForPayment.balance_due ?? 0))).toLocaleString()} PKR
 </span>
 </div>
 <div>
 <span className="text-gray-500 block text-[10px] uppercase font-bold">Remaining Due</span>
 <span className="font-extrabold text-rose-700">
 {Number(selectedBillForPayment.balance_due ?? selectedBillForPayment.total_amount).toLocaleString()} PKR
 </span>
 </div>
 </div>
 )}

 <div className="space-y-1">
 <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Amount (PKR) *</label>
 <input
 type="number"
 step="0.01"
 value={paymentData.amount}
 onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
 placeholder="Enter payment amount"
 required
 className="w-full px-3 py-2.5 min-h-[44px] border border-gray-300 bg-white rounded-xl text-base font-bold text-gray-900 focus:ring-2 focus:ring-green-500 outline-none"
 />
 {selectedBillForPayment && Number(paymentData.amount) > 0 && (
 <p className="text-[11px] text-gray-500 mt-1 font-medium">
 {Number(paymentData.amount) < Number(selectedBillForPayment.balance_due ?? selectedBillForPayment.total_amount) ? (
 <span className="text-amber-700 font-bold">
 ⚠️ Partial Payment: Remaining balance will be {(Number(selectedBillForPayment.balance_due ?? selectedBillForPayment.total_amount) - Number(paymentData.amount)).toLocaleString()} PKR (Status: PARTIALLY PAID)
 </span>
 ) : (
 <span className="text-emerald-700 font-bold">
 ✓ Full Payment: Bill will be marked PAID
 </span>
 )}
 </p>
 )}
 </div>

 <div className="space-y-1">
 <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Date *</label>
 <input
 type="date"
 value={paymentData.date}
 onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
 required
 className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 bg-white rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-green-500 outline-none"
 />
 </div>

 <div className="space-y-1">
 <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Method</label>
 <select
 value={paymentData.method}
 onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}
 className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 bg-white rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-green-500 outline-none"
 >
 <option value="Bank Transfer">Bank Transfer (Main Bank Account)</option>
 <option value="Cash">Cash (Petty Cash)</option>
 <option value="Credit Card">Credit Card</option>
 <option value="Cheque">Cheque</option>
 </select>
 </div>
 </form>

 <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
 <button
 type="button"
 onClick={() => setIsPaymentModalOpen(false)}
 className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 form="paymentForm"
 disabled={isSubmitting}
 className="px-5 py-2.5 min-h-[44px] bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-green-500/20 transition-all cursor-pointer disabled:opacity-50"
 >
 {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
 Confirm Payment
 </button>
 </div>
 </div>
 </div>,
 document.body
 )}

 {/* SUPPLIER STATEMENT MODAL */}
 {mounted && selectedSupplierStatement && createPortal(
 <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
 <div className="bg-white rounded-xl shadow-2xl border border-gray-100 w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
 
 {/* STATEMENT HEADER */}
 <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
 <div>
 <div className="flex items-center gap-2">
 <span className="text-xs font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">Supplier Statement</span>
 <span className="font-mono text-xs font-bold text-gray-500">{getEntityId('SUPP', selectedSupplierStatement)}</span>
 </div>
 <h2 className="text-xl font-extrabold text-gray-900 mt-1 flex items-center gap-2">
 <Truck className="w-5 h-5 text-indigo-600" /> {selectedSupplierStatement.name}
 </h2>
 {(selectedSupplierStatement.email || selectedSupplierStatement.phone) && (
 <p className="text-xs text-gray-500 mt-0.5">
 {selectedSupplierStatement.email} {selectedSupplierStatement.phone && `· ${selectedSupplierStatement.phone}`}
 </p>
 )}
 </div>
 <button
 onClick={() => setSelectedSupplierStatement(null)}
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
          const suppBills = bills.filter(b => b.supplier_id === selectedSupplierStatement.id || b.suppliers?.name === selectedSupplierStatement.name);
          const totalBilled = suppBills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
          const totalPaid = suppBills.reduce((sum, b) => sum + Number(b.amount_paid || (b.total_amount - (b.balance_due ?? 0))), 0);
          const outstandingBalance = Math.max(0, totalBilled - totalPaid);
          const availableAdvance = getSupplierAdvanceBalance(selectedSupplierStatement.id);
          const suppAdvances = paymentsMade.filter(p => p.supplier_id === selectedSupplierStatement.id && p.is_advance);

          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">Total Billed</span>
                  <p className="text-xl font-black text-indigo-950 mt-1">{totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">Total Paid</span>
                  <p className="text-xl font-black text-emerald-950 mt-1">{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                </div>
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block">Outstanding (AP)</span>
                  <p className="text-xl font-black text-rose-950 mt-1">{outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block">Available Advance</span>
                    <p className="text-xl font-black text-purple-950 mt-1">{availableAdvance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                  </div>
                  {availableAdvance > 0 && (
                    <p className="text-[11px] text-purple-800 font-semibold mt-1.5 leading-snug">
                      This supplier owes you goods/services worth {availableAdvance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR.
                    </p>
                  )}
                </div>
              </div>

              {/* ADVANCE PAYMENTS SECTION (IF ANY) */}
              {suppAdvances.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-purple-600" /> Advance Payments & Prepayments History
                  </h3>
                  <div className="border border-purple-100 rounded-xl overflow-hidden shadow-xs bg-purple-50/30">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-purple-50/80 text-purple-900 font-semibold border-b border-purple-100">
                        <tr>
                          <th className="px-4 py-2.5">Date</th>
                          <th className="px-4 py-2.5">Method</th>
                          <th className="px-4 py-2.5">Notes / Particulars</th>
                          <th className="px-4 py-2.5 text-right">Advance Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-100/60 text-gray-700">
                        {suppAdvances.map((adv) => (
                          <tr key={adv.id} className="hover:bg-purple-50/50">
                            <td className="px-4 py-2.5 text-gray-600 font-medium">{adv.date}</td>
                            <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded bg-white text-purple-700 font-bold border border-purple-200 text-[10px]">{adv.payment_method || 'Bank Transfer'}</span></td>
                            <td className="px-4 py-2.5 text-gray-700">{adv.notes || 'Supplier advance prepayment'}</td>
                            <td className="px-4 py-2.5 text-right font-extrabold text-purple-700">{Number(adv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TRANSACTIONS TABLE */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Bill & Payment History</h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3">Bill ID</th>
                        <th className="px-4 py-3">Issue Date</th>
                        <th className="px-4 py-3">Items / Particulars</th>
                        <th className="px-4 py-3 text-right">Billed Amount</th>
                        <th className="px-4 py-3 text-right">Paid Amount</th>
                        <th className="px-4 py-3 text-right">Balance Due</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {suppBills.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                            No bills found for this supplier.
                          </td>
                        </tr>
                      ) : (
                        suppBills.map((b) => {
                          const paid = Number(b.amount_paid || (b.total_amount - (b.balance_due ?? 0)));
                          const due = Number(b.balance_due ?? (b.total_amount - paid));
                          const isPaid = b.status === 'paid' || due <= 0;
                          const isPartial = !isPaid && paid > 0;

                          return (
                            <tr key={b.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono font-bold text-indigo-700">{getEntityId('BILL', b)}</td>
                              <td className="px-4 py-3 text-gray-500">{b.issue_date}</td>
                              <td className="px-4 py-3 text-gray-800 truncate max-w-xs">{b.bill_lines?.map((l: any) => l.description).join(', ') || 'Bill'}</td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">{Number(b.total_amount).toLocaleString()} PKR</td>
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
 onClick={() => setSelectedSupplierStatement(null)}
 className="px-5 py-2.5 min-h-[44px] bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
 >
 Close Statement
 </button>
 </div>

 </div>
 </div>,
 document.body
 )}

      {/* SUPPLIER ADVANCE / PREPAYMENT MODAL */}
      {mounted && isAdvanceModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-indigo-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base sm:text-lg">
                    Log Supplier Advance / Prepayment
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Staged to "Supplier Advances / Prepaid Expenses" (Asset).
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

            <form id="supplierAdvanceForm" onSubmit={handleLogSupplierAdvance} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
              {/* SUPPLIER SELECT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Supplier *
                </label>
                <CreatableSelect
                  options={suppliers}
                  value={advanceData.supplier_id}
                  onChange={(id) => setAdvanceData({ ...advanceData, supplier_id: id })}
                  onCreateNew={async (name) => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return null;
                    const { data, error } = await supabase
                      .from('suppliers')
                      .insert({ user_id: user.id, name, created_by_source: 'MANUAL' })
                      .select('*')
                      .single();
                    if (error) {
                      toast.error(`Failed to create supplier: ${error.message}`);
                      return null;
                    }
                    toast.success(`Supplier "${name}" created!`);
                    setSuppliers(prev => [...prev, data]);
                    return data;
                  }}
                  placeholder="Select or type to create supplier..."
                  entityType="supplier"
                />
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
                  placeholder="e.g. 30000"
                  value={advanceData.amount}
                  onChange={(e) => setAdvanceData({ ...advanceData, amount: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* PAYMENT ACCOUNT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Paid From (Bank / Cash Account) *
                </label>
                <select
                  required
                  value={advanceData.payment_account_id}
                  onChange={(e) => setAdvanceData({ ...advanceData, payment_account_id: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="">Select Payment Account</option>
                  {chartOfAccounts.filter(a => a.is_cash_account || ((a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash')) && !a.name.toLowerCase().includes('receivable') && !a.name.toLowerCase().includes('payable') && !a.name.toLowerCase().includes('advance') && !a.name.toLowerCase().includes('inventory') && !a.name.toLowerCase().includes('fixed'))).map(a => (
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
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={advanceData.date}
                    onChange={(e) => setAdvanceData({ ...advanceData, date: e.target.value })}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
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
                  placeholder="e.g. Raw materials order deposit"
                  value={advanceData.notes}
                  onChange={(e) => setAdvanceData({ ...advanceData, notes: e.target.value })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* DOUBLE ENTRY INFO */}
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs">
                <span className="font-bold block">Double-Entry Accounting Entry:</span>
                <span>
                  Debit: <strong>Supplier Advances / Prepaid Expenses</strong> (+ Asset) &bull; Credit: <strong>Bank / Cash Account</strong> (- Asset).
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
                form="supplierAdvanceForm"
                disabled={isAdvanceSubmitting}
                className="px-5 py-2.5 min-h-[44px] bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors shadow-md shadow-purple-500/20 cursor-pointer text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isAdvanceSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Log Supplier Advance
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* LOAN REPAYMENT & INTEREST SPLIT MODAL (PURCHASES HUB) */}
      {mounted && isLoanModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-teal-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-base sm:text-lg">
                    Record Loan Payment & Interest Split
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Atomic split: Debit Loan Principal + Debit Interest Expense &bull; Credit Cash/Bank.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsLoanModalOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="purchasesLoanForm" onSubmit={handleRecordLoanPayment} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium bg-white">
              {/* SELECT LOAN ACCOUNT */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Loan / Liability Account (Principal) *
                </label>
                <select
                  required
                  value={loanAccountId}
                  onChange={(e) => setLoanAccountId(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">Select a Loan / Liability Account</option>
                  {chartOfAccounts.filter(a => a.type === 'liability').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code || 'Liability'})
                    </option>
                  ))}
                </select>
              </div>

              {/* PAYMENT AMOUNTS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Total Payment Out (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 10000"
                    value={loanTotalAmount}
                    onChange={(e) => setLoanTotalAmount(e.target.value)}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Interest Fee Portion (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 2000 (Fee)"
                    value={loanInterestAmount}
                    onChange={(e) => setLoanInterestAmount(e.target.value)}
                    className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* LIVE BREAKDOWN CALLOUT */}
              {(() => {
                const total = parseFloat(loanTotalAmount) || 0;
                const interest = parseFloat(loanInterestAmount || '0') || 0;
                const principal = Math.max(0, total - interest);

                if (total > 0) {
                  return (
                    <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 text-xs text-emerald-950">
                      <span className="font-bold block uppercase tracking-wider text-[11px] text-emerald-800">
                        Double-Entry Math Breakdown:
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div className="p-2 rounded-lg bg-white border border-emerald-100">
                          <span className="block text-[10px] text-gray-500 font-bold uppercase">Principal (DR)</span>
                          <span className="font-extrabold text-blue-700">{principal.toLocaleString()} PKR</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-emerald-100">
                          <span className="block text-[10px] text-gray-500 font-bold uppercase">Interest (DR)</span>
                          <span className="font-extrabold text-amber-700">{interest.toLocaleString()} PKR</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-emerald-100">
                          <span className="block text-[10px] text-gray-500 font-bold uppercase">Cash Out (CR)</span>
                          <span className="font-extrabold text-rose-700">{total.toLocaleString()} PKR</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* PAYMENT SOURCE (BANK/CASH) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Paid From (Bank / Cash Account) *
                </label>
                <select
                  required
                  value={loanPaymentAccountId}
                  onChange={(e) => setLoanPaymentAccountId(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">Select Payment Source</option>
                  {chartOfAccounts.filter(a => a.is_cash_account || ((a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash')) && !a.name.toLowerCase().includes('receivable') && !a.name.toLowerCase().includes('payable') && !a.name.toLowerCase().includes('advance') && !a.name.toLowerCase().includes('inventory') && !a.name.toLowerCase().includes('fixed'))).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type}) {a.is_cash_account ? '⭐ Cash/Bank' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* DATE */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={loanDate}
                  onChange={(e) => setLoanDate(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* DESCRIPTION */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Description / Particulars
                </label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Bank Loan Installment & Markup"
                  value={loanDescription}
                  onChange={(e) => setLoanDescription(e.target.value)}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </form>

            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="purchasesLoanForm"
                disabled={isLoanSubmitting}
                className="px-5 py-2.5 min-h-[44px] bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-500/20 cursor-pointer text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isLoanSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                Record Loan Payment
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
