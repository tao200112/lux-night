/**
 * TicketDayPricingEditor Component
 * 票种按天定价编辑器：设置每一天的价格和库存限制
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface DayPrice {
  day_of_week: number;
  day_name: string;
  is_enabled: boolean;
  price_cents: number;
  quantity_limit: number | null;
}

interface TicketDayPricingEditorProps {
  ticketTypeId: string;
  defaultPriceCents: number;
  isOpen: boolean;
  onClose: () => void;
  mode?: 'remote' | 'local';       // new prop
  initialPrices?: DayPrice[];    // new prop for local mode
  onSave?: (prices: DayPrice[]) => void; // callback for local mode
}

export default function TicketDayPricingEditor({
  ticketTypeId,
  defaultPriceCents,
  isOpen,
  onClose,
  mode = 'remote',
  initialPrices = [],
  onSave,
}: TicketDayPricingEditorProps) {
  const [prices, setPrices] = useState<DayPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载定价
  const loadPrices = useCallback(async () => {
    if (mode === 'local') {
      if (initialPrices && initialPrices.length > 0) {
        setPrices(initialPrices);
      } else {
        // Initialize with defaults if empty
        const defaultPrices: DayPrice[] = [
          { day_of_week: 0, day_name: 'Sunday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
          { day_of_week: 1, day_name: 'Monday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
          { day_of_week: 2, day_name: 'Tuesday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
          { day_of_week: 3, day_name: 'Wednesday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
          { day_of_week: 4, day_name: 'Thursday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
          { day_of_week: 5, day_name: 'Friday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
          { day_of_week: 6, day_name: 'Saturday', is_enabled: true, price_cents: defaultPriceCents, quantity_limit: null },
        ];
        setPrices(defaultPrices);
      }
      return;
    }

    if (!ticketTypeId) return;
    
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/ticket-types/${ticketTypeId}/prices`);
      if (!res.ok) {
        throw new Error('Failed to load ticket prices');
      }
      const data = await res.json();
      if (data.success && data.data?.prices) {
        setPrices(data.data.prices);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticketTypeId, mode, initialPrices, defaultPriceCents]);

  useEffect(() => {
    if (isOpen) {
      loadPrices();
    }
  }, [isOpen, loadPrices]);

  // 保存定价
  const savePrices = async () => {
    if (mode === 'local') {
      if (onSave) {
        onSave(prices);
      }
      onClose();
      return;
    }

    if (!ticketTypeId) return;
    
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/admin/ticket-types/${ticketTypeId}/prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save ticket prices');
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePrice = (dayIndex: number, field: keyof DayPrice, value: any) => {
    setPrices(prev => prev.map((p, i) => {
      if (i === dayIndex) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const applyDefaultToAll = () => {
    setPrices(prev => prev.map(p => ({
      ...p,
      price_cents: defaultPriceCents,
    })));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Day-by-Day Pricing</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Customize price and availability for each day (Default: ${(defaultPriceCents / 100).toFixed(2)})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Day</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">Enabled</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Price ($)</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">Daily Limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {prices.map((price, i) => (
                    <tr key={price.day_of_week} className={!price.is_enabled ? 'opacity-50' : ''}>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {price.day_name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={price.is_enabled}
                          onChange={(e) => updatePrice(i, 'is_enabled', e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={(price.price_cents / 100).toFixed(2)}
                          onChange={(e) => updatePrice(i, 'price_cents', Math.round(parseFloat(e.target.value || '0') * 100))}
                          disabled={!price.is_enabled}
                          className="w-24 px-2 py-1 text-right border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:bg-slate-100 disabled:dark:bg-slate-800"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          placeholder="Unlim."
                          value={price.quantity_limit ?? ''}
                          onChange={(e) => updatePrice(i, 'quantity_limit', e.target.value === '' ? null : parseInt(e.target.value))}
                          disabled={!price.is_enabled}
                          className="w-24 px-2 py-1 text-center border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:bg-slate-100 disabled:dark:bg-slate-800"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex justify-between items-center">
             <button
              onClick={applyDefaultToAll}
              disabled={loading || saving}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors"
            >
              Reset all to defaults
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={savePrices}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              'Save Prices'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
