'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Check, ChevronDown, Loader2, UserPlus, Building } from 'lucide-react';

interface Option {
  id: string;
  name: string;
  [key: string]: any;
}

interface CreatableSelectProps {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  onCreateNew: (name: string) => Promise<Option | null>;
  placeholder?: string;
  entityType?: 'customer' | 'supplier' | 'account';
  disabled?: boolean;
  className?: string;
}

export default function CreatableSelect({
  options = [],
  value,
  onChange,
  onCreateNew,
  placeholder = 'Select or type to create...',
  entityType = 'customer',
  disabled = false,
  className = ''
}: CreatableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const exactMatch = options.some(
    o => o.name.toLowerCase().trim() === searchQuery.toLowerCase().trim()
  );

  async function handleCreate() {
    const trimmed = searchQuery.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    try {
      const created = await onCreateNew(trimmed);
      if (created && created.id) {
        onChange(created.id);
        setSearchQuery('');
        setIsOpen(false);
      }
    } catch (e) {
      console.error(`Failed to create ${entityType}:`, e);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-300 bg-white text-xs text-left text-gray-900 outline-none focus:ring-2 focus:ring-blue-600 flex items-center justify-between gap-2 shadow-xs cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <span className={selectedOption ? 'font-bold text-gray-900 truncate' : 'text-gray-400 font-normal truncate'}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-[10000] top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in duration-150">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search or type new ${entityType} name...`}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 bg-white"
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            {searchQuery.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2 transition-all cursor-pointer border border-emerald-200"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                )}
                <span className="truncate">
                  {isCreating ? `Creating "${searchQuery.trim()}"...` : `+ Create "${searchQuery.trim()}" as new ${entityType}`}
                </span>
              </button>
            )}

            {filteredOptions.length === 0 && !searchQuery.trim() && (
              <div className="p-3 text-center text-xs text-gray-400">
                No existing {entityType}s. Type a name to create one.
              </div>
            )}

            {filteredOptions.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={`w-full px-3 py-2 text-xs text-left rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  value === option.id
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-gray-700 hover:bg-gray-100 font-medium'
                }`}
              >
                <span className="truncate">{option.name}</span>
                {value === option.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
