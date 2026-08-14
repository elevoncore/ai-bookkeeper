'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, FileText, Users, Package, Edit2, Trash2, Loader2, X, AlertCircle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';

export default function SalesHub() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'customers' | 'products'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ id: '', customer_id: '', issue_date: '', amount: '' });
  const [isEditing, setIsEditing] = useState(false);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({ invoice_id: '', amount: '', date: new Date().toISOString().split('T')[0], method: 'Bank Transfer' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<{ id?: string; name: string; price: string; cost: string; is_inventory_tracked: boolean }>({ name: '', price: '', cost: '', is_inventory_tracked: true });
  const [editedInvoiceIds, setEditedInvoiceIds] = useState<Set<string>>(new Set());

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

    if (activeTab === 'invoices') {
      const { data: invData } = await supabase
        .from('invoices')
        .select('*, customers(name), invoice_lines(description, quantity, total, products(cost, is_inventory_tracked))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (invData) setInvoices(invData);
    } else if (activeTab === 'customers') {
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (custData) setCustomers(custData);
    } else if (activeTab === 'products') {
      const { data: prodData } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (prodData) setProducts(prodData);
    }
    
    setIsLoading(false);
  }

  // Pre-fetch customers for the modal
  useEffect(() => {
    async function getCustomers() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('customers').select('*').eq('user_id', user.id);
      if (data) setCustomers(data);
    }
    getCustomers();
  }, []);

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
        toast.success("Invoice created successfully!", { id: toastId });
        closeModal();
        fetchData();
      }
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
    
    setIsSubmitting(true);
    const toastId = toast.loading("Logging payment...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
       setIsSubmitting(false);
       return toast.error("Not authenticated", { id: toastId });
    }

    const safeAmount = Math.round(parseToCents(paymentData.amount)) / 100;

    const { error } = await supabase.rpc('log_payment_received_atomic', {
      p_invoice_id: paymentData.invoice_id,
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

        <div className="flex bg-gray-100 p-1 rounded-xl text-sm font-medium w-full sm:w-auto overflow-x-auto min-w-0">
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
              if (activeTab === 'invoices') {
                setIsEditing(false);
                setNewInvoice({ id: '', customer_id: '', issue_date: '', amount: '' });
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

        {/* LISTING */}
        <div className="p-0 overflow-x-auto min-w-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                {activeTab === 'invoices' && (
                  <tr>
                    <th className="px-6 py-4">Invoice ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Issue Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-right">Est. Margin</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">AI Verified</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                )}
                {activeTab === 'customers' && (
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Added</th>
                  </tr>
                )}
                {activeTab === 'products' && (
                  <tr>
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
                {activeTab === 'invoices' && invoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
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
                {activeTab === 'customers' && customers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <p className="text-gray-500 font-medium">No customers found</p>
                    </td>
                  </tr>
                )}
                {activeTab === 'products' && products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <p className="text-gray-500 font-medium">No products found</p>
                    </td>
                  </tr>
                )}

                {/* DATA ROWS */}
                {activeTab === 'invoices' && invoices.map((inv) => {
                  const estMargin = inv.invoice_lines?.reduce((sum: number, l: any) => {
                    const cost = l.products?.cost || 0;
                    const margin = Number(l.total || 0) - (Number(l.quantity || 1) * Number(cost));
                    return sum + margin;
                  }, 0) || 0;

                  return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                      <span>INV-{inv.id.substring(0, 6).toUpperCase()}</span>
                      {inv.created_by_source === 'AI' || (inv.is_ai_verified && inv.created_by_source !== 'MANUAL') ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">🤖 AI</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">👤 Manual</span>
                      )}
                      {(inv.is_manually_edited || editedInvoiceIds.has(inv.id)) && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">✏️ Edited</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-blue-700 max-w-[150px] truncate" title={inv.customers?.name}>
                      {inv.customers?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-gray-700 truncate max-w-[200px]" title={inv.invoice_lines?.map((l: any) => l.description).join(', ')}>
                      {inv.invoice_lines?.map((l: any) => l.description).join(', ') || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {inv.issue_date}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {inv.total_amount.toLocaleString()} PKR
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                      {estMargin > 0 ? '+' : ''}{estMargin.toLocaleString()} PKR
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                        inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        inv.status === 'partial' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        inv.status === 'draft' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                        'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {inv.status.toUpperCase()}
                      </span>
                      {inv.balance_due > 0 && inv.status !== 'draft' && (
                        <div className="text-[10px] text-gray-500 mt-1 font-medium">Due: {inv.balance_due.toLocaleString()}</div>
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
                        {inv.balance_due > 0 && inv.status !== 'draft' && (
                          <button 
                            onClick={() => {
                              setPaymentData(prev => ({ ...prev, invoice_id: inv.id, amount: inv.balance_due.toString() }));
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

                {activeTab === 'customers' && customers.map((c) => (
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

                {activeTab === 'products' && products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
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

      {/* SLIDE-OVER MODAL FOR NEW INVOICE */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white h-full max-h-screen shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Invoice' : 'Create New Invoice'}</h2>
              <button onClick={closeModal} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 bg-white rounded-full shadow-xs cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateInvoice} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Customer</label>
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newInvoice.customer_id}
                  onChange={e => setNewInvoice({...newInvoice, customer_id: e.target.value})}
                  required
                >
                  <option value="">Select a Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">If the customer is missing, ask the AI to "Create customer X".</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Issue Date</label>
                <input 
                  type="date" 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newInvoice.issue_date}
                  onChange={e => setNewInvoice({...newInvoice, issue_date: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (PKR)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newInvoice.amount}
                  onChange={e => setNewInvoice({...newInvoice, amount: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={closeModal} className="flex-1 px-4 py-3 min-h-[44px] border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleCreateOrUpdateInvoice} className="flex-1 px-4 py-3 min-h-[44px] bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 cursor-pointer">
                {isEditing ? 'Save Changes' : 'Create Invoice'}
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
                Log Received Payment
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleLogPayment} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount Received (PKR)</label>
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

      {/* EDIT PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white/90 backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600 shrink-0" />
                Edit Product / Service Catalog
              </h2>
              <button onClick={() => setIsProductModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Name</label>
                <input 
                  type="text" 
                  required
                  value={editingProduct.name}
                  onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
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
                    className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
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
                    className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium"
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

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 px-4 py-3 min-h-[44px] bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-xl transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" onClick={handleSaveProduct} className="flex-1 px-4 py-3 min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-purple-600/20 cursor-pointer">
                Save Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CUSTOMER MODAL */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 shrink-0" />
                Add New Customer
              </h2>
              <button onClick={() => setIsCustomerModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateCustomer} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer Name *</label>
                <input 
                  type="text" 
                  required
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  placeholder="e.g. Manual Audit Corp"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" 
                  value={newCustomer.email}
                  onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                  placeholder="audit@example.com"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone Number</label>
                <input 
                  type="text" 
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  placeholder="+1 555-0199"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="flex-1 px-4 py-3 min-h-[44px] bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-xl transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" onClick={handleCreateCustomer} className="flex-1 px-4 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-blue-600/20 cursor-pointer">
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
