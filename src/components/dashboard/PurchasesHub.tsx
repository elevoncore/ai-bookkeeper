'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, Receipt, Truck, Edit2, Trash2, Loader2, X, AlertCircle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';

export default function PurchasesHub() {
  const [activeTab, setActiveTab] = useState<'bills' | 'suppliers'>('bills');
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [newBill, setNewBill] = useState({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
  const [isEditing, setIsEditing] = useState(false);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({ bill_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        .select('*, suppliers(name), bill_lines(*, accounts(name))')
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
    if (!paymentData.bill_id || !paymentData.amount || !paymentData.date) {
      return toast.error("Please fill in all payment details.");
    }

    const payAmount = parseFloat(paymentData.amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return toast.error("Invalid payment amount.");
    }

    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setIsSubmitting(false);
      return;
    }

    try {
      const { data: bill } = await supabase
        .from('bills')
        .select('*')
        .eq('id', paymentData.bill_id)
        .single();

      if (!bill) throw new Error("Bill not found");

      const newBalance = Math.max(0, Number(bill.balance_due) - payAmount);
      const newStatus = newBalance === 0 ? 'paid' : 'partial';

      await supabase
        .from('bills')
        .update({
          balance_due: newBalance,
          status: newStatus,
          updated_at: new Date().toISOString()
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
          reference_type: 'PAYMENT_MADE'
        }).select().single();

        if (entry) {
          await supabase.from('journal_lines').insert([
            { journal_id: entry.id, account_id: apAccount.id, debit: payAmount, credit: 0 },
            { journal_id: entry.id, account_id: bankAccount.id, debit: 0, credit: payAmount }
          ]);
        }
      }

      toast.success(`Logged ${payAmount.toLocaleString()} PKR payment for Bill!`);
      setIsPaymentModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error("Payment failed:", err);
      toast.error(`Payment failed: ${err.message}`);
    } finally {
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
    <div className="space-y-6 relative min-w-0">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl min-w-0">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Purchases & Bills Hub
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage vendor bills, accounts payable, and supplier directories.
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl text-sm font-medium w-full sm:w-auto overflow-x-auto custom-scrollbar min-w-0">
          <button
            onClick={() => setActiveTab('bills')}
            className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg transition-all cursor-pointer whitespace-nowrap ${activeTab === 'bills' ? 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-indigo-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Receipt className="w-4 h-4" /> Bills
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg transition-all cursor-pointer whitespace-nowrap ${activeTab === 'suppliers' ? 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-emerald-700 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Truck className="w-4 h-4" /> Suppliers
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
            {activeTab === 'bills' && (
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
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
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
                      Amount {sortField === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">AI Verified</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                )}
                {activeTab === 'suppliers' && (
                  <tr>
                    <th className="px-6 py-4">Name</th>
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
                    <td colSpan={8} className="px-6 py-16 text-center">
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
                    <td colSpan={4} className="px-6 py-16 text-center">
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
                {activeTab === 'bills' && filteredBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                      <span>BILL-{bill.id.substring(0, 6).toUpperCase()}</span>
                      {bill.created_by_source === 'AI' || (bill.is_ai_verified && bill.created_by_source !== 'MANUAL') ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
                      )}
                      {(bill.is_manually_edited || editedBillIds.has(bill.id)) && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">✏️ Edited</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-indigo-700 truncate" title={bill.suppliers?.name}>
                      {bill.suppliers?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-gray-700 truncate" title={bill.bill_lines?.map((l: any) => l.description).join(', ')}>
                      {bill.bill_lines?.map((l: any) => l.description).join(', ') || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {bill.issue_date}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {bill.total_amount.toLocaleString()} PKR
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                        bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        bill.status === 'partial' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        bill.status === 'draft' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                        'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {bill.status.toUpperCase()}
                      </span>
                      {bill.balance_due > 0 && bill.status !== 'draft' && (
                        <div className="text-[10px] text-gray-500 mt-1 font-medium">Due: {bill.balance_due.toLocaleString()}</div>
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
                        {bill.balance_due > 0 && bill.status !== 'draft' && (
                          <button 
                            onClick={() => {
                              setPaymentData(prev => ({ ...prev, bill_id: bill.id, amount: bill.balance_due.toString() }));
                              setIsPaymentModalOpen(true);
                            }}
                            className="px-3 py-2 min-h-[44px] text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
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
                ))}

                {activeTab === 'suppliers' && filteredSuppliers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
                      <span>{c.name}</span>
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

      {/* CENTERED POP-UP MODAL FOR NEW/EDIT BILL */}
      {isBillModalOpen && (
        <div className="fixed inset-0 z-[100] w-screen h-screen flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing ? 'Edit Bill' : 'Create New Expense Bill'}
              </h2>
              <button onClick={closeModal} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="billForm" onSubmit={handleSaveBill} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Supplier</label>
                <select
                  value={newBill.supplier_id}
                  onChange={(e) => setNewBill({ ...newBill, supplier_id: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Expense Account</label>
                <select
                  value={newBill.account_id}
                  onChange={(e) => setNewBill({ ...newBill, account_id: e.target.value })}
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Default Expense Account</option>
                  {chartOfAccounts.filter(a => a.type === 'expense').map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={newBill.issue_date}
                  onChange={(e) => setNewBill({ ...newBill, issue_date: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Total Amount (PKR)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newBill.amount}
                  onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </form>

            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="billForm"
                disabled={isSubmitting}
                className="px-5 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEditing ? 'Update Bill' : 'Save Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR NEW SUPPLIER */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-[100] w-screen h-screen flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="font-bold text-gray-900 text-base sm:text-lg">New Supplier</h3>
              <button onClick={() => setIsSupplierModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="supplierForm" onSubmit={handleCreateSupplier} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  required
                  placeholder="e.g. Acme Supplies"
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                  placeholder="vendor@acme.com"
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  placeholder="+92 300 1234567"
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </form>
            <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="px-4 py-2.5 min-h-[44px] border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="supplierForm"
                className="px-5 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
              >
                Save Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR LOG PAYMENT */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[100] w-screen h-screen flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="font-bold text-gray-900 text-base sm:text-lg">Log Vendor Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form id="paymentForm" onSubmit={handleLogPayment} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-medium">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Amount (PKR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentData.date}
                  onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 min-h-[44px] border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
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
        </div>
      )}

    </div>
  );
}
