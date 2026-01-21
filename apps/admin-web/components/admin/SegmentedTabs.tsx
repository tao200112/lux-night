/**
 * Segmented Tabs
 * 分段标签组件（用于 Approvals 的 Pending/Approved/Rejected）
 */

'use client';

interface SegmentedTab {
  id: string;
  label: string;
  count?: number;
}

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export default function SegmentedTabs({
  tabs,
  activeTab,
  onChange,
}: SegmentedTabsProps) {
  return (
    <div className="px-4 pb-3">
      <div className="flex p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex-1 py-1.5 px-3 text-sm rounded-[0.2rem] transition-all text-center ${
                isActive
                  ? 'bg-white dark:bg-surface-dark text-primary dark:text-white shadow-sm font-semibold'
                  : 'text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-white font-medium'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
