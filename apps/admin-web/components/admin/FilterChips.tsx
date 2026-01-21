/**
 * Filter Chips
 * 筛选标签组件
 */

'use client';

interface FilterChip {
  id: string;
  label: string;
  active?: boolean;
  removable?: boolean;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onChange?: (chipId: string) => void;
  onRemove?: (chipId: string) => void;
}

export default function FilterChips({
  chips,
  onChange,
  onRemove,
}: FilterChipsProps) {
  return (
    <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar items-center">
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onChange?.(chip.id)}
          className={`flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-lg border shadow-sm transition-colors ${
            chip.active
              ? 'bg-primary-action/10 border-primary-action/20 text-primary-action dark:text-blue-400'
              : 'bg-white dark:bg-surface-dark border-border-light dark:border-border-dark text-primary dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          <span className="text-xs font-medium">{chip.label}</span>
          {chip.removable && chip.active ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.(chip.id);
              }}
              className="material-symbols-outlined text-[16px]"
            >
              close
            </button>
          ) : chip.active ? (
            <span className="material-symbols-outlined text-[16px]">arrow_drop_down</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
