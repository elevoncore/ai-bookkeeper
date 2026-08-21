'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, Receipt, Truck, Edit2, Trash2, Loader2, X, AlertCircle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';

export default function PurchasesHub() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'bills' | 'suppliers'>('bills');
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [newBill, setNewBill] = useState({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
  const [isEditing, setIsEditing] = useState(false);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<any>(null);
  const [paymentData, setPaymentData] = useState({ bill_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedSupplierStatement, setSelectedSupplierStatement] = useState<any>(null);

  function getEntityId(prefix: string, item: any) {
    if (item.code) return item.code;
    const idStr = item.id ? item.id.substring(0, 6).toUpperCase() : '001';
    return `${prefix}-${idStr}`;
  }

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', email: '', phone: '' });
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

    if (activeTab === 'bills') {
      const { data, error } = await supabase
        .from('bills')
        .select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(name))')
        .eq('user_id', user.id)
        .order('issue_date', { ascending: false });

      if (error) console.error("Error fetching bills:", error);
      else setBills(data || []);

      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      
      setChartOfAccounts(accountsData || []);
    } else {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) console.error("Error fetching suppliers:", error);
      else setSuppliers(data || []);
    }
    setIsLoading(false);
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
      if (isEditing && newBill.id) {
        const { error: billError } = await supabase
          .from('bills')
          .update({
            supplier_id: newBill.supplier_id,
            issue_date: newBill.issue_date,
            total_amount: numericAmount,
            balance_due: numericAmount,
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
      } else {
        const { data: createdBill, error: billError } = await supabase
          .from('bills')
          .insert({
            user_id: user.id,
            supplier_id: newBill.supplier_id,
            issue_date: newBill.issue_date,
            total_amount: numericAmount,
            balance_due: numericAmount,
            status: 'unpaid',
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
      return toast.error("Invalid payment amount.");
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Logging vendor payment...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated", { id: toastId });
      setIsSubmitting(false);
      return;
    }

    const safeAmount = Math.round(parseToCents(paymentData.amount)) / 100;

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
      amount: bill.total_amount.toString()
    });
    setIsBillModalOpen(true);
  }

  function closeModal() {
    setIsBillModalOpen(false);
    setIsEditing(false);
    setNewBill({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
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
          
          <button 
            onClick={() => {
              if (activeTab === 'bills') {
                setIsEditing(false);
                setNewBill({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
                setIsBillModalOpen(true);
              } else {
                setNewSupplier({ name: '', email: '', phone: '' });
                setIsSupplierModalOpen(true);
              }
            }}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 font-bold" />
            New {activeTab === 'bills' ? 'Bill' : 'Supplier'}
          </button>
        </div>

        {/* LISTING */}
        <div className="p-0 overflow-x-auto custom-scrollbar min-w-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-indigo-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[850px]">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
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
                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {getEntityId('BILL', bill)}
                      </span>
                      {bill.created_by_source === 'AI' || (bill.is_ai_verified && bill.created_by_source !== 'MANUAL') ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
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
                    <td className="px-6 py-4 text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* MODAL FOR LOG PAYMENT (WITH PARTIAL PAYMENT ENGINE) */}
      {mounted && isPaymentModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
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
          <div className="bg-white rounded-xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
            
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

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">Total Billed</span>
                        <p className="text-xl font-black text-indigo-950 mt-1">{totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">Total Paid</span>
                        <p className="text-xl font-black text-emerald-950 mt-1">{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                      </div>
                      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                        <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block">Outstanding Balance (AP)</span>
                        <p className="text-xl font-black text-rose-950 mt-1">{outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</p>
                      </div>
                    </div>

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

    </div>
  );
}
