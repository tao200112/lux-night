/**
 * Search Bar
 * 搜索栏组件
 */

'use client';

import { useState } from 'react';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
}

export default function SearchBar({
  placeholder = 'Search...',
  value,
  onChange,
  onSearch,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(value);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={`flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border ${
          isFocused
            ? 'border-primary dark:border-blue-500'
            : 'border-slate-200 dark:border-slate-700'
        } transition-colors`}
      >
        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[20px]">
          search
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </div>
    </form>
  );
}
