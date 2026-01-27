/**
 * WeeklyScheduleEditor Component
 * 周期售票规则编辑器：周一到周日 7 天的售票开关和有效时间
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface WeeklyRule {
  day_of_week: number;
  day_name: string;
  is_on_sale: boolean;
  valid_from_time: string;
  valid_to_time: string;
  is_overnight: boolean;
  timezone: string;
}

interface WeeklyScheduleEditorProps {
  eventId: string;
  scheduleMode: 'single' | 'weekly' | 'custom';
  onScheduleModeChange: (mode: 'single' | 'weekly' | 'custom') => void;
  onRulesChange?: (rules: WeeklyRule[]) => void;
  disabled?: boolean;
  mode?: 'remote' | 'local';       // new prop
  initialRules?: WeeklyRule[];   // new prop
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WeeklyScheduleEditor({
  eventId,
  scheduleMode,
  onScheduleModeChange,
  onRulesChange,
  disabled = false,
  mode = 'remote',
  initialRules = [],
}: WeeklyScheduleEditorProps) {
  const [rules, setRules] = useState<WeeklyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 加载规则
  const loadRules = useCallback(async () => {
    if (mode === 'local') {
      if (initialRules && initialRules.length > 0) {
        setRules(initialRules);
      } else {
         // Default rules
         setRules(DAY_NAMES.map((name, i) => ({
          day_of_week: i,
          day_name: name,
          is_on_sale: i === 5 || i === 6, // Default Fri/Sat
          valid_from_time: '22:00:00',
          valid_to_time: '04:00:00',
          is_overnight: true,
          timezone: 'America/Los_Angeles',
        })));
      }
      return;
    }

    if (!eventId) return;
    
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/events/${eventId}/weekly-rules`);
      if (!res.ok) {
        throw new Error('Failed to load weekly rules');
      }
      const data = await res.json();
      if (data.success && data.data?.rules) {
        setRules(data.data.rules);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [eventId, mode, initialRules]);

  useEffect(() => {
    if ((eventId || mode === 'local') && scheduleMode === 'weekly') {
      loadRules();
    } else if (scheduleMode === 'weekly' && !eventId && mode === 'remote') {
      // Default rules for remote mode but no eventId yet (shouldn't happen often if we have strict checks)
      setRules(DAY_NAMES.map((name, i) => ({
        day_of_week: i,
        day_name: name,
        is_on_sale: i === 5 || i === 6, 
        valid_from_time: '22:00:00',
        valid_to_time: '04:00:00',
        is_overnight: true,
        timezone: 'America/Los_Angeles',
      })));
    }
  }, [eventId, scheduleMode, loadRules, mode]);

  // 保存规则
  const saveRules = async () => {
    if (mode === 'local') return; // Local mode updates via effect/callback

    if (!eventId) return;
    
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/admin/events/${eventId}/weekly-rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules,
          schedule_mode: scheduleMode,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save weekly rules');
      }
      setHasChanges(false);
      onRulesChange?.(rules);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (dayIndex: number, field: keyof WeeklyRule, value: any) => {
    const newRules = rules.map((r, i) => {
      if (i === dayIndex) {
        const updated = { ...r, [field]: value };
        // 自动计算 is_overnight
        if (field === 'valid_from_time' || field === 'valid_to_time') {
          const from = field === 'valid_from_time' ? value : r.valid_from_time;
          const to = field === 'valid_to_time' ? value : r.valid_to_time;
          updated.is_overnight = to < from;
        }
        return updated;
      }
      return r;
    });

    setRules(newRules);
    setHasChanges(true);
    
    if (mode === 'local' && onRulesChange) {
      onRulesChange(newRules);
    }
  };

  const toggleAll = (enabled: boolean) => {
    const newRules = rules.map(r => ({ ...r, is_on_sale: enabled }));
    setRules(newRules);
    setHasChanges(true);
    if (mode === 'local' && onRulesChange) {
      onRulesChange(newRules);
    }
  };

  const applyToAllDays = (dayIndex: number) => {
    const source = rules[dayIndex];
    const newRules = rules.map(r => ({
      ...r,
      valid_from_time: source.valid_from_time,
      valid_to_time: source.valid_to_time,
      is_overnight: source.is_overnight,
    }));
    setRules(newRules);
    setHasChanges(true);
    if (mode === 'local' && onRulesChange) {
      onRulesChange(newRules);
    }
  };

  if (scheduleMode !== 'weekly') {
    return (
      <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Schedule Mode</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Current mode: <span className="font-medium capitalize">{scheduleMode}</span>
            </p>
          </div>
          <button
            onClick={() => onScheduleModeChange('weekly')}
            disabled={disabled}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            Switch to Weekly Schedule
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">calendar_month</span>
            Weekly Schedule
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure which days tickets are available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleAll(false)}
            disabled={disabled}
            className="px-3 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Disable All
          </button>
          <button
            onClick={() => toggleAll(true)}
            disabled={disabled}
            className="px-3 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Enable All
          </button>
          <button
            onClick={() => onScheduleModeChange('single')}
            disabled={disabled}
            className="px-3 py-1 text-xs text-slate-500 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Back to Single
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="ml-2 text-sm text-slate-500">Loading schedule...</span>
        </div>
      ) : (
        <>
          {/* Rules Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Day</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">On Sale</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">Valid From</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">Valid To</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">Overnight</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {rules.map((rule, i) => (
                  <tr 
                    key={rule.day_of_week} 
                    className={`${rule.is_on_sale ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`font-medium ${rule.is_on_sale ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                        {rule.day_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => updateRule(i, 'is_on_sale', !rule.is_on_sale)}
                        disabled={disabled}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          rule.is_on_sale 
                            ? 'bg-green-500' 
                            : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          rule.is_on_sale ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="time"
                        value={rule.valid_from_time.slice(0, 5)}
                        onChange={(e) => updateRule(i, 'valid_from_time', e.target.value + ':00')}
                        disabled={disabled || !rule.is_on_sale}
                        className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-center disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="time"
                        value={rule.valid_to_time.slice(0, 5)}
                        onChange={(e) => updateRule(i, 'valid_to_time', e.target.value + ':00')}
                        disabled={disabled || !rule.is_on_sale}
                        className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-center disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rule.is_overnight ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <span className="material-symbols-outlined text-sm">nights_stay</span>
                          Next Day
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Same Day</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => applyToAllDays(i)}
                        disabled={disabled}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-primary hover:underline"
                        title="Apply this time to all days"
                      >
                        Apply to all
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Save Button */}
          {hasChanges && eventId && (
            <div className="flex justify-end">
              <button
                onClick={saveRules}
                disabled={saving || disabled}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">save</span>
                    Save Schedule
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
