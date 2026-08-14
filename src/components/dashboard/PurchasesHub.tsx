'use client';

import { useState, useEffect } from 'react';
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
      const { data: billsData } = await supabase
        .from('bills')
        .select('*, suppliers(name), bill_lines(description)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (billsData) setBills(billsData);
    } else if (activeTab === 'suppliers') {
      const { data: suppData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (suppData) setSuppliers(suppData);
    }
    
    setIsLoading(false);
  }

  // Pre-fetch suppliers and accounts for the modal
  useEffect(() => {
    async function getModalData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: supps } = await supabase.from('suppliers').select('*').eq('user_id', user.id);
      if (supps) setSuppliers(supps);
      
      const { data: accs } = await supabase.from('accounts').select('*').eq('user_id', user.id).eq('type', 'expense');
      if (accs) setChartOfAccounts(accs);
    }
    getModalData();
  }, []);

  async function handleCreateOrUpdateBill(e: React.FormEvent) {
    e.preventDefault();
    if (!newBill.supplier_id || !newBill.amount || !newBill.issue_date || !newBill.account_id) {
      toast.error("Please fill in all fields");
      return;
    }
    
    const toastId = toast.loading(isEditing ? "Updating Bill..." : "Creating Bill...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.dismiss(toastId);
      return toast.error("Not authenticated");
    }
    
    const safeAmountCents = parseToCents(newBill.amount);
    
    if (isEditing) {
      const currentBill = bills.find(b => b.id === newBill.id);
      
      const { error } = await supabase.rpc('update_bill_atomic', {
        p_bill_id: newBill.id,
        p_user_id: user.id,
        p_supplier_id: newBill.supplier_id,
        p_issue_date: newBill.issue_date,
        p_due_date: null,
        p_status: currentBill?.status || 'open',
        p_total_amount: Math.round(safeAmountCents) / 100,
        p_receipt_url: currentBill?.receipt_url || null,
        p_line_items: [{
           account_id: newBill.account_id,
           description: 'Manual entry',
           amount: Math.round(safeAmountCents) / 100
        }]
      });
      
      if (error) {
        toast.error(`Error: ${error.message}`, { id: toastId });
        return;
      }

      try { await supabase.from('bills').update({ is_manually_edited: true }).eq('id', newBill.id); } catch (_) {}
      setEditedBillIds(prev => new Set(prev).add(newBill.id));
      toast.success("Bill updated successfully!", { id: toastId });
      closeModal();
      fetchData();

    } else {
      const { data: insertedId, error: createError } = await supabase.rpc('create_bill_with_lines_atomic', {
        p_user_id: user.id,
        p_supplier_id: newBill.supplier_id,
        p_issue_date: newBill.issue_date,
        p_due_date: null,
        p_status: 'open',
        p_total_amount: Math.round(safeAmountCents) / 100,
        p_receipt_url: null,
        p_line_items: [{
           account_id: newBill.account_id,
           description: 'Manual entry',
           amount: Math.round(safeAmountCents) / 100
        }],
        p_currency_code: 'PKR',
        p_exchange_rate: 1.0,
        p_original_amount: Math.round(safeAmountCents) / 100
      });

      if (createError) {
        toast.error(`Error: ${createError.message}`, { id: toastId });
      } else {
        try { await supabase.from('bills').update({ is_ai_verified: true, created_by_source: 'MANUAL', is_manually_edited: false }).eq('id', insertedId); } catch (_) {}
        toast.success("Bill created and posted to ledger!", { id: toastId });
        closeModal();
        fetchData();
      }
    }
  }

  async function handleDeleteBill(id: string) {
    const bill = bills.find(b => b.id === id);
    if (bill?.is_ai_verified) {
      toast.error("Verified bills cannot be deleted. They are part of your permanent ledger.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this bill? This will also remove the corresponding journal entries.")) return;
    const toastId = toast.loading("Deleting bill...");
    const { error } = await supabase.from('bills').delete().eq('id', id);
    if (error) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    } else {
      toast.success("Bill deleted!", { id: toastId });
      fetchData();
    }
  }

  async function handleLogPayment(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!paymentData.amount || !paymentData.date) return toast.error("Please fill in all fields");
    
    setIsSubmitting(true);
    const toastId = toast.loading("Logging payment...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
       setIsSubmitting(false);
       return toast.error("Not authenticated", { id: toastId });
    }

    const safeAmount = Math.round(parseToCents(paymentData.amount)) / 100;

    const { error } = await supabase.rpc('log_payment_made_atomic', {
      p_bill_id: paymentData.bill_id,
      p_user_id: user.id,
      p_amount: safeAmount,
      p_date: paymentData.date,
      p_method: paymentData.method
    });

    if (error) {
      toast.error(`Error: ${error.message}`, { id: toastId });
      setIsSubmitting(false);
    } else {
      toast.success("Payment logged successfully!", { id: toastId });
      setIsSubmitting(false);
      setIsPaymentModalOpen(false);
      fetchData();
    }
  }

  async function openEditModal(bill: any) {
    setIsEditing(true);
    const { data: line } = await supabase.from('bill_lines').select('account_id').eq('bill_id', bill.id).limit(1).single();
    
    setNewBill({
      id: bill.id,
      supplier_id: bill.supplier_id,
      account_id: line?.account_id || '',
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
            Expenses & Bills Hub
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your bills, expenses, and supplier catalog.
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
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`} 
              className="w-full pl-9 pr-4 py-2.5 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
            />
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
                    <th className="px-6 py-4">Bill ID</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Issue Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
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
                {activeTab === 'bills' && bills.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500">
                          <Receipt className="w-6 h-6" />
                        </div>
                        <p className="text-gray-500 font-medium">No bills found</p>
                        <p className="text-xs text-gray-400">Create one manually or drag a receipt into the AI Assistant.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {activeTab === 'suppliers' && suppliers.length === 0 && (
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
                {activeTab === 'bills' && bills.map((bill) => (
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

                {activeTab === 'suppliers' && suppliers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
                      <span>{c.name}</span>
                      {c.created_by_source === 'AI' ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
                      )}
                      {c.is_manually_edited && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">✏️ Edited</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{c.email || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{c.phone || '-'}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SLIDE-OVER MODAL FOR NEW BILL */}
      {isBillModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white h-full max-h-screen shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Bill' : 'Create New Bill'}</h2>
              <button onClick={closeModal} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 bg-white rounded-full shadow-xs cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateBill} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Supplier</label>
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.supplier_id}
                  onChange={e => setNewBill({...newBill, supplier_id: e.target.value})}
                  required
                >
                  <option value="">Select a Supplier</option>
                  {suppliers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">If the supplier is missing, ask the AI to "Create supplier X".</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Expense Account</label>
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.account_id}
                  onChange={e => setNewBill({...newBill, account_id: e.target.value})}
                  required
                >
                  <option value="">Select an Expense Account</option>
                  {chartOfAccounts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Issue Date</label>
                <input 
                  type="date" 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.issue_date}
                  onChange={e => setNewBill({...newBill, issue_date: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (PKR)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.amount}
                  onChange={e => setNewBill({...newBill, amount: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={closeModal} className="flex-1 px-4 py-3 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleCreateOrUpdateBill} className="flex-1 px-4 py-3 min-h-[44px] bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-500/20 cursor-pointer">
                {isEditing ? 'Save Changes' : 'Create Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOG PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white/90 backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600 shrink-0" />
                Log Payment Made
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleLogPayment} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount Paid (PKR)</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={paymentData.amount}
                  onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date of Payment</label>
                <input 
                  type="date" 
                  required
                  value={paymentData.date}
                  onChange={e => setPaymentData({...paymentData, date: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-gray-600"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment Method</label>
                <select 
                  value={paymentData.method}
                  onChange={e => setPaymentData({...paymentData, method: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-gray-600"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} disabled={isSubmitting} className="flex-1 px-4 py-3 min-h-[44px] bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" onClick={handleLogPayment} disabled={isSubmitting} className="flex-1 px-4 py-3 min-h-[44px] bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-green-600/20 cursor-pointer disabled:opacity-50 flex items-center justify-center">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW SUPPLIER MODAL */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600 shrink-0" />
                Add New Supplier
              </h2>
              <button onClick={() => setIsSupplierModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateSupplier} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier Name *</label>
                <input 
                  type="text" 
                  required
                  value={newSupplier.name}
                  onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
                  placeholder="e.g. Acme Supplies Inc"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" 
                  value={newSupplier.email}
                  onChange={e => setNewSupplier({...newSupplier, email: e.target.value})}
                  placeholder="supplier@example.com"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone Number</label>
                <input 
                  type="text" 
                  value={newSupplier.phone}
                  onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
                  placeholder="+1 555-0188"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-sm"
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="flex-1 px-4 py-3 min-h-[44px] bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-xl transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" onClick={handleCreateSupplier} className="flex-1 px-4 py-3 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-600/20 cursor-pointer">
                Save Supplier
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
