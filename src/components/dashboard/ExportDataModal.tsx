'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react';

interface ExportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExportDataModal({ isOpen, onClose }: ExportDataModalProps) {
  const [mounted, setMounted] = useState(false);
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '1y' | 'all'>('all');
  const [selectedModules, setSelectedModules] = useState<string[]>(['Overview', 'Sales', 'Purchases', 'Accounting']);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const ALL_MODULES = ['Overview', 'Sales', 'Purchases', 'Accounting'];
  const isAllSelected = selectedModules.length === ALL_MODULES.length;

  const handleToggleModule = (mod: string) => {
    if (selectedModules.includes(mod)) {
      setSelectedModules(prev => prev.filter(m => m !== mod));
    } else {
      setSelectedModules(prev => [...prev, mod]);
    }
  };

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedModules([]);
    } else {
      setSelectedModules([...ALL_MODULES]);
    }
  };

  const handleExport = async () => {
    if (selectedModules.length === 0) return;
    
    setIsDownloading(true);
    setDownloadComplete(false);
    
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe, selectedModules })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bookkeeper_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setDownloadComplete(true);
      setTimeout(() => {
        onClose();
        setDownloadComplete(false);
      }, 2000);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to generate export file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-xl flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200 border border-gray-100">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Export Data</h2>
              <p className="text-sm text-gray-500">Generate a multi-sheet Excel backup</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          
          {/* Timeframe Selector */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Timeframe</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: '1y', label: 'Last 1 Year' },
                { id: 'all', label: 'All Time' }
              ].map(tf => (
                <button
                  key={tf.id}
                  onClick={() => setTimeframe(tf.id as any)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                    timeframe === tf.id 
                      ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Module Selectors */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Data Modules</h3>
              <button 
                onClick={handleToggleAll}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_MODULES.map(mod => (
                <div 
                  key={mod}
                  onClick={() => handleToggleModule(mod)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedModules.includes(mod)
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                    selectedModules.includes(mod)
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-gray-300'
                  }`}>
                    {selectedModules.includes(mod) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className={`font-medium ${selectedModules.includes(mod) ? 'text-blue-900' : 'text-gray-700'}`}>
                    {mod}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Download Complete Mode Note */}
          {isAllSelected && timeframe === 'all' && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-800">Download Complete (Full Backup)</h4>
                <p className="text-xs text-emerald-600 mt-1">
                  You have selected all modules and all time. This will generate a complete backup of your entire system.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition-all"
            disabled={isDownloading}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={selectedModules.length === 0 || isDownloading || downloadComplete}
            className={`px-6 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 ${
              selectedModules.length === 0 
                ? 'bg-gray-300 cursor-not-allowed'
                : downloadComplete
                  ? 'bg-emerald-500 hover:bg-emerald-600'
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : downloadComplete ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Downloaded!
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Generate Excel
              </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
