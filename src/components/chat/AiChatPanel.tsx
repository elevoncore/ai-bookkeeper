'use client';

import { useState, useRef, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, ArrowUp, Loader2, X, CheckCircle2, Receipt, Bot, User, History, BookOpen } from 'lucide-react';
import { Account, InvoiceStatus } from '@/types';
import { parseToCents, formatFromCents } from '@/utils/currency';
import { findBestAccountMatch } from '@/utils/fuzzyMatch';
import { createJournalEntryAtomic } from '@/utils/journalEntry';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  isApproved?: boolean;
  imagePreview?: string | null;
  extractedDraft?: {
    intent: string;
    entity_name: string; // customer or supplier
    amount: number;
    status: InvoiceStatus;
    issue_date: string;
    due_date?: string | null;
    draft_id?: string;
    is_approved?: boolean;
    line_items?: Array<{
      description: string;
      quantity?: number;
      unit_price?: number;
      total?: number;
      amount?: number;
      account_name: string;
      is_debit?: boolean;
      debit?: number;
      credit?: number;
    }>;
    transactionId?: string;
  } | null;
  timestamp: string;
}

interface AiChatPanelProps {
  chartOfAccounts: Account[];
  onDataChanged: () => void;
  onClose?: () => void;
}

export default function AiChatPanel({ chartOfAccounts, onDataChanged, onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: `welcome-${Date.now()}`,
    sender: 'ai',
    text: 'Hello! I am your AI SME Bookkeeper. Upload a bill, invoice, or type details (e.g. "I paid AWS 1500 PKR for hosting"), and I will record the double-entry automatically.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [processingDraftIds, setProcessingDraftIds] = useState<Set<string>>(new Set());
  const processingRef = useRef<Set<string>>(new Set());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isExtracting]);

  async function fetchChatLogs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('ai_chat_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setChatLogs(data);
  }

  function toggleHistory() {
    if (!isHistoryOpen) fetchChatLogs();
    setIsHistoryOpen(!isHistoryOpen);
  }

  function loadLog(log: any) {
    if (log.transcript) {
      setMessages(log.transcript);
    }
    setIsViewingHistory(true);
    setIsHistoryOpen(false);
  }

  function startNewChat() {
    setIsViewingHistory(false);
    setSessionId(crypto.randomUUID());
    setMessages([{
      id: `welcome-${Date.now()}`,
      sender: 'ai',
      text: 'Hello! I am your AI SME Bookkeeper. Upload a bill, invoice, or type details, and I will record the double-entry automatically.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setPrompt('');
    clearImage();
  }

  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) return alert("Please upload a valid image file.");
    if (file.size > 5 * 1024 * 1024) return alert("Image is too large. Please upload an image under 5MB.");
    
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        setImageBase64(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageFile(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Helper function to resolve account with fuzzy matching and fallback to General Operating Expense
  async function resolveAccountId(accName: string | null | undefined, intent: string) {
    const isBill = intent === 'LOG_BILL';
    const defaultFallback = isBill ? 'General Operating Expense' : 'Sales Revenue';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // 1. Fetch user's complete active accounts list from DB
    const { data: dbAccounts } = await supabase
      .from('accounts')
      .select('id, name, type')
      .eq('user_id', user.id);

    const availableAccounts = dbAccounts && dbAccounts.length > 0 ? dbAccounts : (chartOfAccounts || []);

    if (accName) {
      // Perform fuzzy Levenshtein match across available accounts (55% similarity threshold)
      const fuzzyMatch = findBestAccountMatch(accName, availableAccounts, 0.55);
      if (fuzzyMatch) {
        return fuzzyMatch.account.id;
      }
    }

    // Fallback to General Operating Expense for bills / Sales Revenue for invoices
    const fallbackMatch = findBestAccountMatch(defaultFallback, availableAccounts, 0.50);
    if (fallbackMatch) {
      return fallbackMatch.account.id;
    }

    // Ultimate safety net: Insert default account if not present
    const accType = isBill ? 'expense' : 'revenue';
    const finalName = accName || defaultFallback;
    const { data: newAccount } = await supabase
      .from('accounts')
      .insert({ user_id: user.id, name: finalName, type: accType, is_system: true })
      .select('id')
      .single();

    return newAccount?.id;
  }

  // Helper function to resolve or create product
  async function resolveProductId(prodName: string, price: number, isInventoryTracked: boolean = false, passedProductId?: string | null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    if (passedProductId) {
      const { data: existingById } = await supabase.from('products').select('id').eq('id', passedProductId).eq('user_id', user.id).maybeSingle();
      if (existingById) return existingById.id;
    }
    if (!prodName) return null;
    const { data: existingProd } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', prodName)
      .maybeSingle();
    
    if (existingProd) return existingProd.id;

    let { data: newProd, error: newProdErr } = await supabase
      .from('products')
      .insert({ user_id: user.id, name: prodName, price, is_inventory_tracked: isInventoryTracked, inventory_count: 0, created_by_source: 'AI' })
      .select('id')
      .single();

    if (newProdErr) {
      const fallback = await supabase
        .from('products')
        .insert({ user_id: user.id, name: prodName, price, is_inventory_tracked: isInventoryTracked, inventory_count: 0 })
        .select('id')
        .single();
      newProd = fallback.data;
    }

    return newProd?.id;
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() && !imageBase64) return;

    const userText = prompt.trim() || "Uploaded receipt image";
    const currentImage = imageBase64;
    const messageId = `msg-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newUserMsg: ChatMessage = { id: messageId, sender: 'user', text: userText, imagePreview: currentImage, timestamp };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setPrompt('');
    clearImage();
    setIsExtracting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error("Authentication required. Please sign in.");

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ 
          prompt: userText, 
          image: currentImage, 
          history: updatedMessages,
          chartOfAccounts: chartOfAccounts 
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to process expense via AI.");
      }

      const aiData = await res.json();

      if (['QUERY_FINANCES', 'QUERY_DEBT', 'QUERY_REPORT', 'GENERAL_HELP', 'UPDATE_TRANSACTION'].includes(aiData.intent)) {
        const completeTranscript = [...updatedMessages, {
          id: `ai-${Date.now()}`,
          sender: 'ai' as const,
          text: aiData.conversational_response || "Transaction processed.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }];
        setMessages(completeTranscript);
        onDataChanged();
        
        await supabase.from('ai_chat_logs').delete().eq('id', sessionId);
        await supabase.from('ai_chat_logs').insert({
          id: sessionId,
          user_id: user.id,
          reference_type: 'other',
          reference_id: null,
          transcript: completeTranscript
        });
        return;
      }

      if (!aiData.is_complete) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.clarification_question || "I need a few more details to log this.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      const ext = aiData;
      const safeAmountCents = parseToCents(ext.total_amount || 0);
      let insertedId = null;

      let receiptUrl = null;
      if (currentImage) {
        // Convert base64 to Blob
        const fetchRes = await fetch(currentImage);
        const blob = await fetchRes.blob();
        const fileName = `receipt-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, blob, { contentType: 'image/jpeg' });
          
        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = publicUrlData.publicUrl;
        }
      }

      if (ext.intent === 'LOG_BILL') {
        let supplierId = null;
        if (ext.supplier_name) {
          let upsertRes = await supabase.from('suppliers').upsert({ user_id: user.id, name: ext.supplier_name, created_by_source: 'AI' }, { onConflict: 'user_id,name' }).select('id').single();
          if (upsertRes.error) {
            upsertRes = await supabase.from('suppliers').upsert({ user_id: user.id, name: ext.supplier_name }, { onConflict: 'user_id,name' }).select('id').single();
          }
          if (upsertRes.error) throw new Error(`Supplier resolution failed: ${upsertRes.error.message}`);
          supplierId = upsertRes.data?.id;
        }

        const resolvedLines = [];
        for (const item of ext.line_items || []) {
          const accToResolve = (item.is_inventory_tracked || item.account_name === 'Inventory Asset') ? 'Inventory Asset' : item.account_name;
          const targetAccountId = await resolveAccountId(accToResolve, ext.intent);
          if (!targetAccountId) throw new Error(`Account resolution failed for ${item.account_name}`);
          
          let productId = null;
          if (item.product_name || item.product_id) {
            productId = await resolveProductId(item.product_name, parseToCents(item.unit_price || 0) / 100, item.is_inventory_tracked, item.product_id);
          }

          resolvedLines.push({
            account_id: targetAccountId,
            product_id: productId,
            description: item.description,
            quantity: item.quantity || 1,
            unit_price: parseToCents(item.unit_price || item.total || 0) / 100,
            amount: parseToCents(item.total || 0) / 100
          });
        }

        const { data: billId, error: rpcError } = await supabase.rpc('create_bill_with_lines_atomic', {
          p_user_id: user.id,
          p_supplier_id: supplierId,
          p_issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          p_due_date: ext.due_date || null,
          p_status: 'open',
          p_total_amount: safeAmountCents / 100,
          p_receipt_url: receiptUrl,
          p_line_items: resolvedLines,
          p_currency_code: ext.currency_code || 'PKR',
          p_exchange_rate: ext.exchange_rate || 1.0,
          p_original_amount: ext.original_amount || (safeAmountCents / 100)
        });
        
        if (rpcError) throw new Error(`Atomic Bill Creation Failed: ${rpcError.message}`);
        insertedId = billId;
        try { await supabase.from('bills').update({ created_by_source: 'AI' }).eq('id', billId); } catch (_) {}

        if (ext.status === 'paid') {
           const { error: payError } = await supabase.rpc('log_payment_made_atomic', {
             p_bill_id: billId,
             p_user_id: user.id,
             p_amount: safeAmountCents / 100,
             p_date: ext.issue_date || new Date().toISOString().split('T')[0],
             p_method: 'Cash'
           });
           if (payError) throw new Error(`Payment Logging Failed: ${payError.message}`);
        }

      } else if (ext.intent === 'LOG_INVOICE') {
        let customerId = null;
        if (ext.customer_name) {
          let upsertRes = await supabase.from('customers').upsert({ user_id: user.id, name: ext.customer_name, created_by_source: 'AI' }, { onConflict: 'user_id,name' }).select('id').single();
          if (upsertRes.error) {
            upsertRes = await supabase.from('customers').upsert({ user_id: user.id, name: ext.customer_name }, { onConflict: 'user_id,name' }).select('id').single();
          }
          if (upsertRes.error) throw new Error(`Customer resolution failed: ${upsertRes.error.message}`);
          customerId = upsertRes.data?.id;
        }

        const resolvedLines = [];
        for (const item of ext.line_items || []) {
          const safePrice = parseToCents(item.unit_price || 0) / 100;
          const targetProdName = item.product_name || item.description;
          const productId = await resolveProductId(targetProdName, safePrice, item.is_inventory_tracked, item.product_id);
          if (!productId) throw new Error(`Product resolution failed for ${targetProdName}`);
          resolvedLines.push({
            product_id: productId,
            description: item.description,
            quantity: item.quantity || 1,
            unit_price: safePrice,
            total: parseToCents(item.total || 0) / 100
          });
        }

        const { data: invoiceId, error: rpcError } = await supabase.rpc('create_invoice_with_lines_atomic', {
          p_user_id: user.id,
          p_customer_id: customerId,
          p_issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          p_due_date: ext.due_date || null,
          p_status: 'open',
          p_total_amount: safeAmountCents / 100,
          p_receipt_url: receiptUrl,
          p_line_items: resolvedLines,
          p_currency_code: ext.currency_code || 'PKR',
          p_exchange_rate: ext.exchange_rate || 1.0,
          p_original_amount: ext.original_amount || (safeAmountCents / 100)
        });
        
        if (rpcError) throw new Error(`Atomic Invoice Creation Failed: ${rpcError.message}`);
        insertedId = invoiceId;
        try { await supabase.from('invoices').update({ created_by_source: 'AI' }).eq('id', invoiceId); } catch (_) {}

        if (ext.status === 'paid') {
           const { error: payError } = await supabase.rpc('log_payment_received_atomic', {
             p_invoice_id: invoiceId,
             p_user_id: user.id,
             p_amount: safeAmountCents / 100,
             p_date: ext.issue_date || new Date().toISOString().split('T')[0],
             p_method: 'Cash'
           });
           if (payError) throw new Error(`Payment Logging Failed: ${payError.message}`);
        }
      }

      if (ext.intent === 'LOG_JOURNAL_ENTRY') {
        const finalAiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: ext.conversational_response || `I have staged your General Journal Entry for verification.`,
          extractedDraft: {
            intent: 'LOG_JOURNAL_ENTRY',
            entity_name: 'General Journal Entry',
            amount: safeAmountCents / 100,
            status: 'open',
            issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
            line_items: ext.line_items,
            transactionId: `je-${Date.now()}`
          },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const completeTranscript = [...updatedMessages, finalAiMessage];
        setMessages(completeTranscript);
        onDataChanged();
        setIsExtracting(false);
        return;
      }

      const finalAiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `I successfully extracted the details and staged the ${ext.intent === 'LOG_BILL' ? 'Bill' : 'Invoice'}! Please verify to push it to the Ledger.`,
        extractedDraft: {
          intent: ext.intent,
          entity_name: ext.supplier_name || ext.customer_name || 'Unknown',
          amount: safeAmountCents / 100,
          status: ext.status || 'open',
          issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          due_date: ext.due_date,
          line_items: ext.line_items,
          transactionId: insertedId
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const completeTranscript = [...updatedMessages, finalAiMessage];

      // Record Audit Log
      await supabase.from('ai_chat_logs').delete().eq('id', sessionId);
      await supabase.from('ai_chat_logs').insert({
        id: sessionId,
        user_id: user.id,
        reference_type: ext.intent === 'LOG_BILL' ? 'bill' : (ext.intent === 'LOG_INVOICE' ? 'invoice' : 'other'),
        reference_id: insertedId || null,
        transcript: completeTranscript
      });

      setMessages(completeTranscript);
      onDataChanged();

    } catch (err: any) {
      console.error("[CRITICAL] Chat Extraction Failed:", err);
      let errorText = `Sorry, I encountered an issue: ${err.message || 'Could not process request.'}`;
      if (err.message?.includes('Unauthorized')) errorText = `⚠️ **Session Expired:** Please sign in again.`;
      
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleVerifyDraft(msgId: string, txId?: string, intent?: string) {
    if (!intent) return;
    if (processingRef.current.has(msgId) || processingDraftIds.has(msgId)) return; // 0ms micro-tick synchronous locking safeguard
    processingRef.current.add(msgId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      processingRef.current.delete(msgId);
      return;
    }

    setProcessingDraftIds(prev => new Set(prev).add(msgId));

    try {
      if (intent === 'LOG_JOURNAL_ENTRY') {
        const msg = messages.find(m => m.id === msgId);
        if (!msg || !msg.extractedDraft?.line_items) return;

        const journalLines = [];
        let idx = 0;
        for (const item of msg.extractedDraft.line_items) {
          const accId = await resolveAccountId(item.account_name, 'LOG_JOURNAL_ENTRY');
          if (!accId) {
            alert(`Could not resolve account "${item.account_name}"`);
            return;
          }
          let isDebit = false;
          if (item.is_debit !== undefined) {
            isDebit = Boolean(item.is_debit);
          } else if (item.debit && item.debit > 0) {
            isDebit = true;
          } else if (item.credit && item.credit > 0) {
            isDebit = false;
          } else {
            isDebit = idx === 0;
          }
          idx++;

          const amount = item.total || item.amount || item.unit_price || 0;
          journalLines.push({
            account_id: accId,
            debit: isDebit ? amount : 0,
            credit: !isDebit ? amount : 0
          });
        }

        const res = await createJournalEntryAtomic(supabase, {
          user_id: user!.id,
          date: msg.extractedDraft.issue_date || new Date().toISOString().split('T')[0],
          description: msg.text || 'General Journal Entry',
          lines: journalLines,
          created_by_source: 'AI',
          draft_id: msg.extractedDraft.draft_id || msgId
        });

        if (res.error) {
          alert(`Journal Entry Failed: ${res.error}`);
          return;
        }

        onDataChanged();
        setMessages(prev => prev.map(m => {
          if (m.id === msgId && m.extractedDraft) {
            return {
              ...m,
              isApproved: true,
              text: "✓ Journal Entry verified and posted to the General Ledger!",
              extractedDraft: { ...m.extractedDraft, is_approved: true, status: 'open' }
            };
          }
          return m;
        }));
        return;
      }

      const table = intent === 'LOG_BILL' ? 'bills' : 'invoices';
      const { error } = await supabase.from(table).update({ is_ai_verified: true }).eq('id', txId!);
      if (!error) {
        onDataChanged();
        setMessages(prev => prev.map(m => {
          if (m.id === msgId && m.extractedDraft) {
            return {
              ...m,
              isApproved: true,
              text: "✓ Verified and posted to the General Ledger!",
              extractedDraft: { ...m.extractedDraft, is_approved: true, status: 'open' }
            };
          }
          return m;
        }));
      }
    } catch (err: any) {
      console.error("Verification failed:", err);
      alert(`Approval error: ${err.message || 'Verification failed.'}`);
    } finally {
      processingRef.current.delete(msgId);
      setProcessingDraftIds(prev => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white/40 backdrop-blur-2xl border border-white/60 md:rounded-2xl shadow-xl overflow-hidden relative min-w-0">
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-blue-50/30 flex items-center justify-between sticky top-0 z-10 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2 truncate">AI Bookkeeper</h3>
            <p className="text-[11px] text-gray-500 font-medium truncate">Double-Entry AI Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={startNewChat} className="px-3.5 py-2 min-h-[44px] bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 rounded-full transition-colors shadow-sm whitespace-nowrap cursor-pointer flex items-center">
            New Chat
          </button>
          <button onClick={toggleHistory} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 rounded-full transition-colors shadow-sm shrink-0 cursor-pointer" title="Chat History" aria-label="Chat History">
            <History className="w-5 h-5" />
          </button>
          {onClose && (
            <button onClick={onClose} className="md:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors shrink-0 cursor-pointer" aria-label="Close Chat"><X className="w-5 h-5" /></button>
          )}
        </div>
      </div>

      {isHistoryOpen && (
        <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-2xl flex flex-col pt-16 animate-in slide-in-from-right-full duration-300">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Chat History</h3>
            <button onClick={() => setIsHistoryOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {chatLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No history found.</p>
            ) : (
              chatLogs.map(log => (
                <button 
                  key={log.id} 
                  onClick={() => loadLog(log)}
                  className="w-full text-left p-3 rounded-xl border border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer min-h-[44px]"
                >
                  <p className="font-semibold text-gray-800 text-sm truncate">
                    {(() => {
                       const firstUserMsg = log.transcript?.find((m: any) => m.sender === 'user');
                       if (firstUserMsg && firstUserMsg.text) {
                         return firstUserMsg.text.length > 40 ? firstUserMsg.text.substring(0, 40) + '...' : firstUserMsg.text;
                       }
                       return log.reference_type === 'bill' ? 'Logged Bill' : (log.reference_type === 'invoice' ? 'Logged Invoice' : 'New Chat');
                    })()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto min-h-0 flex flex-col space-y-4 min-w-0">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} min-w-0`}>
            {msg.sender === 'ai' && <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-1">AI</div>}
            
            <div className={`max-w-[85%] space-y-2 min-w-0 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              {msg.imagePreview && (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-xs max-w-xs mb-1">
                  <img src={msg.imagePreview} alt="Uploaded receipt" className="max-h-48 object-cover w-full" />
                </div>
              )}
              
              <div className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs break-words whitespace-pre-wrap min-w-0 ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'}`}>
                {msg.text}
              </div>

              {msg.extractedDraft && (
                msg.extractedDraft.intent === 'LOG_JOURNAL_ENTRY' ? (
                  /* Journal Entry Verification Card */
                  <div className="bg-white/90 backdrop-blur-md rounded-xl border border-purple-100 p-3.5 shadow-sm space-y-2.5 mt-2 animate-in fade-in duration-200 min-w-0">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-2 gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 truncate">
                        <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
                        Journal Entry Verification
                      </span>
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                        JOURNAL ENTRY
                      </span>
                    </div>

                    <div className="text-xs space-y-2 min-w-0">
                      <div className="flex justify-between text-gray-600 gap-2 min-w-0">
                        <span className="truncate">Date: <span className="font-semibold text-gray-900">{msg.extractedDraft.issue_date}</span></span>
                        <span className="shrink-0">Total: <span className="font-extrabold text-purple-900">{msg.extractedDraft.amount.toLocaleString()} PKR</span></span>
                      </div>

                      <div className="overflow-x-auto custom-scrollbar min-w-0 rounded-lg border border-gray-200 bg-white">
                        <table className="w-full text-left text-[11px] whitespace-nowrap min-w-[280px]">
                          <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100">
                            <tr>
                              <th className="px-3 py-2">Account</th>
                              <th className="px-3 py-2 text-right w-20">Debit</th>
                              <th className="px-3 py-2 text-right w-20">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {msg.extractedDraft.line_items?.map((item, idx) => {
                              let isDebit = false;
                              if (item.is_debit !== undefined) {
                                isDebit = Boolean(item.is_debit);
                              } else if (item.debit && item.debit > 0) {
                                isDebit = true;
                              } else if (item.credit && item.credit > 0) {
                                isDebit = false;
                              } else {
                                isDebit = idx === 0;
                              }
                              const amt = item.total || item.amount || item.unit_price || 0;
                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-semibold text-gray-800">{item.account_name}</td>
                                  <td className="px-3 py-2 text-right font-bold text-blue-600">{isDebit ? `${amt.toLocaleString()} PKR` : '-'}</td>
                                  <td className="px-3 py-2 text-right font-bold text-purple-600">{!isDebit ? `${amt.toLocaleString()} PKR` : '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    {msg.isApproved || msg.extractedDraft?.is_approved || msg.text.includes('✓') ? (
                      <div className="w-full py-2.5 px-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 mt-2 shadow-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Approved into Ledger ✅
                      </div>
                    ) : (
                      <button
                        disabled={processingDraftIds.has(msg.id)}
                        onClick={() => handleVerifyDraft(msg.id, msg.extractedDraft?.transactionId, msg.extractedDraft?.intent)}
                        className="w-full py-2.5 min-h-[44px] bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-2 shadow-sm"
                      >
                        {processingDraftIds.has(msg.id) ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" /> Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Approve into Ledger
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  /* Standard Bill / Invoice Card */
                  <div className="bg-white/90 backdrop-blur-md rounded-xl border border-blue-100 p-3.5 shadow-sm space-y-2.5 mt-2 animate-in fade-in duration-200 min-w-0">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 truncate">
                        <Receipt className="w-4 h-4 text-blue-600 shrink-0" />
                        {msg.extractedDraft.entity_name} 
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${msg.isApproved || msg.extractedDraft?.is_approved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {msg.isApproved || msg.extractedDraft?.is_approved ? 'VERIFIED' : 'PENDING VERIFICATION'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs min-w-0">
                      <div className="min-w-0">
                        <span className="text-gray-400 text-[10px] block">Amount:</span>
                        <p className="font-bold text-gray-900 truncate">{msg.extractedDraft.amount} PKR</p>
                      </div>
                      <div className="min-w-0">
                        <span className="text-gray-400 text-[10px] block">Issue Date:</span>
                        <p className="font-medium text-gray-700 truncate">{msg.extractedDraft.issue_date}</p>
                      </div>
                      {msg.extractedDraft.due_date && (
                        <div className="min-w-0">
                          <span className="text-gray-400 text-[10px] block">Due Date:</span>
                          <p className="font-medium text-red-600 truncate">{msg.extractedDraft.due_date}</p>
                        </div>
                      )}
                      <div className="col-span-2 min-w-0">
                        <span className="text-gray-400 text-[10px] block">Line Items:</span>
                        <ul className="text-gray-700 mt-1 space-y-1 min-w-0">
                          {msg.extractedDraft.line_items?.map((item, idx) => (
                            <li key={idx} className="flex justify-between items-center text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100 min-w-0 gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 truncate">{item.description}</p>
                                <p className="text-gray-500 truncate">{item.quantity} x {item.unit_price} PKR &middot; <span className="text-blue-600">{item.account_name}</span></p>
                              </div>
                              <p className="font-bold shrink-0">{item.total} PKR</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    
                    {msg.isApproved || msg.extractedDraft?.is_approved || msg.text.includes('✓') ? (
                      <div className="w-full py-2.5 px-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 mt-2 shadow-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Approved into Ledger ✅
                      </div>
                    ) : (
                      <button
                        disabled={processingDraftIds.has(msg.id)}
                        onClick={() => handleVerifyDraft(msg.id, msg.extractedDraft?.transactionId, msg.extractedDraft?.intent)}
                        className="w-full py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-2 shadow-sm"
                      >
                        {processingDraftIds.has(msg.id) ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" /> Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Approve into Ledger
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
            
            {msg.sender === 'user' && <div className="w-7 h-7 rounded-lg bg-gray-900 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1"><User className="w-4 h-4" /></div>}
          </div>
        ))}
        {isExtracting && (
          <div className="flex gap-3 items-center text-xs text-blue-600 font-medium">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>Analyzing receipt & extracting structured financial data...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-3 bg-white/40 backdrop-blur-2xl border-t border-gray-100 sticky bottom-0 z-10">
        {imagePreview(imageBase64, clearImage)}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
            }} 
          />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()} 
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Upload Receipt Image"
            aria-label="Upload Receipt Image"
          >
            <Plus className="w-5 h-5" />
          </button>
          
          <input 
            type="text" 
            value={prompt} 
            onChange={(e) => setPrompt(e.target.value)} 
            placeholder="Ask AI or describe transaction..." 
            className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 min-h-[44px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          />

          <button 
            type="submit" 
            disabled={isExtracting || (!prompt.trim() && !imageBase64)} 
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            aria-label="Send Message"
          >
            {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function imagePreview(base64: string | null, onClear: () => void) {
  if (!base64) return null;
  return (
    <div className="relative inline-block mb-2">
      <img src={base64} alt="Receipt Preview" className="h-16 w-16 object-cover rounded-lg border border-blue-200 shadow-sm" />
      <button 
        type="button" 
        onClick={onClear} 
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
