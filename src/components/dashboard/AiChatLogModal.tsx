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

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
        
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 shrink-0">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-base sm:text-lg">
            <Bot className="w-5 h-5 text-blue-600 shrink-0" /> AI Audit Log
          </h2>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-slate-800 rounded-full shadow-xs hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" aria-label="Close modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-w-0 font-medium">
          {isLoading ? (
            <div className="flex justify-center py-12 text-blue-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : !log || !log.transcript ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No AI chat log found for this transaction. It may have been entered manually.
            </div>
          ) : (
            log.transcript.map((msg: any, idx: number) => (
              <div key={idx} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} min-w-0`}>
                {msg.sender === 'ai' && <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-1">AI</div>}
                
                <div className={`max-w-[85%] space-y-2 min-w-0 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.imagePreview && (
                    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm max-w-xs mb-1">
                      <img src={msg.imagePreview} alt="Uploaded receipt" className="max-h-32 object-cover w-full" />
                    </div>
                  )}
                  
                  <div className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap min-w-0 ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-200 dark:border-slate-700'}`}>
                    {msg.text}
                  </div>
                </div>
                
                {msg.sender === 'user' && <div className="w-7 h-7 rounded-lg bg-gray-900 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1"><User className="w-4 h-4" /></div>}
              </div>
            ))
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
