/**
 * Approval Diff Panel
 * Before/After 对比面板（用于 Approval Detail）
 */

'use client';

interface DiffField {
  key: string;
  label: string;
  before: any;
  after: any;
}

interface ApprovalDiffPanelProps {
  before: Record<string, any>;
  after: Record<string, any>;
  fields?: DiffField[];
}

export default function ApprovalDiffPanel({
  before,
  after,
  fields,
}: ApprovalDiffPanelProps) {
  // 如果没有提供 fields，自动生成
  const diffFields: DiffField[] = fields || Object.keys(after || {}).map((key) => {
    // 格式化标签
    let label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    
    // 特殊字段标签映射
    const labelMap: Record<string, string> = {
      'Price Cents': 'Ticket Price (USD)',
      'Inventory Limit': 'Inventory Count',
      'Start At': 'Event Start Time',
      'End At': 'Event End Time',
      'Title': 'Event Title',
      'Description': 'Event Description',
    };
    
    label = labelMap[label] || label;
    
    return {
      key,
      label,
      before: before?.[key],
      after: after?.[key],
    };
  });

  const formatValue = (value: any, key?: string): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    
    // 格式化特殊字段
    if (key === 'price_cents' || key?.includes('price')) {
      return `$${(Number(value) / 100).toFixed(2)}`;
    }
    if (key?.includes('at') || key?.includes('time') || key?.includes('date')) {
      try {
        const date = new Date(value);
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York',
        });
      } catch {
        return String(value);
      }
    }
    
    return String(value);
  };

  const hasChanges = (before: any, after: any): boolean => {
    return JSON.stringify(before) !== JSON.stringify(after);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
        Changes Summary
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Before Column */}
        <div className="flex-1">
          <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-t-lg border-b border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Before
            </h4>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-b-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            {diffFields.map((field) => {
              const changed = hasChanges(field.before, field.after);
              
              return (
                <div
                  key={field.key}
                  className={`p-3 rounded border ${
                    changed
                      ? 'border-danger/50 bg-red-50/50 dark:bg-red-900/10'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {field.label}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white break-words">
                    {formatValue(field.before, field.key)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* After Column */}
        <div className="flex-1">
          <div className="sticky top-0 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-t-lg border-b border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              After
            </h4>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-b-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            {diffFields.map((field) => {
              const changed = hasChanges(field.before, field.after);
              
              return (
                <div
                  key={field.key}
                  className={`p-3 rounded border ${
                    changed
                      ? 'border-success/50 bg-green-50/50 dark:bg-green-900/10'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {field.label}
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white break-words">
                    {formatValue(field.after, field.key)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
