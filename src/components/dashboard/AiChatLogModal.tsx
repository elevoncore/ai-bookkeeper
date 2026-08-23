import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserClient } from '@supabase/ssr';
import { X, Bot, User, Loader2 } from 'lucide-react';

interface AiChatLogModalProps {
  txId: string;
  onClose: () => void;
}

export default function AiChatLogModal({ txId, onClose }: AiChatLogModalProps) {
  const [mounted, setMounted] = useState(false);
  const [log, setLog] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function fetchLog() {
      const { data } = await supabase
        .from('ai_chat_logs')
        .select('*')
        .eq('reference_id', txId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setLog(data);
      setIsLoading(false);
    }
    fetchLog();
  }, [txId, supabase]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-log-title"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-[calc(100%-1.5rem)] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
        
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-slate-800/60 shrink-0">
          <h2 id="ai-log-title" className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
            <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" /> AI Audit Log
          </h2>
          <button 
            onClick={onClose} 
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500" 
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 min-w-0 font-medium text-slate-900 dark:text-slate-100">
          {isLoading ? (
            <div className="flex justify-center py-12 text-blue-600 dark:text-blue-400">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : !log || !log.transcript ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
              No AI chat log found for this transaction. It may have been entered manually.
            </div>
          ) : (
            log.transcript.map((msg: any, idx: number) => (
              <div key={idx} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} min-w-0`}>
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 mt-1 border border-blue-200 dark:border-blue-800/60">
                    AI
                  </div>
                )}
                
                <div className={`max-w-[85%] space-y-2 min-w-0 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.imagePreview && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm max-w-xs mb-1">
                      <img src={msg.imagePreview} alt="Uploaded receipt" className="max-h-32 object-cover w-full" />
                    </div>
                  )}
                  
                  <div className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap min-w-0 ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-200 dark:border-slate-700'}`}>
                    {msg.text}
                  </div>
                </div>
                
                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
