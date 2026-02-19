/**
 * Debug Page - Complete Pending Orders
 * /debug/orders
 */

'use client';

import { useState } from 'react';
import PageContainer from '@/components/admin/PageContainer';

export default function DebugOrdersPage() {
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleComplete = async () => {
    if (!orderId.trim()) {
      alert('Please enter an order ID');
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const res = await fetch('/api/admin/debug/complete-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderId.trim() }),
      });

      const data = await res.json();
      setResult(data);

      if (data.ok) {
        alert(`Success! ${data.message}\nTickets created: ${data.ticketCount || 0}`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
      setResult({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer className="bg-slate-900 text-white">
      <div className="max-w-2xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">🛠️ Debug: Complete Pending Orders</h1>
        
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <label className="block text-sm font-medium mb-2">Order ID</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="e.g. 35fe4c1a-..."
            className="w-full px-4 py-2 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          <button
            onClick={handleComplete}
            disabled={loading}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Processing...' : 'Complete Order'}
          </button>
        </div>

        {result && (
          <div className={`rounded-lg p-6 ${result.ok ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'}`}>
            <h3 className="font-bold mb-2">{result.ok ? '✅ Success' : '❌ Error'}</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-8 bg-yellow-900/30 border border-yellow-500 rounded-lg p-6">
          <h3 className="font-bold mb-2">⚠️ Instructions</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Copy the Order ID from the admin dashboard (e.g., "35fe4c1a")</li>
            <li>Paste it in the input field above</li>
            <li>Click "Complete Order"</li>
            <li>This will:
              <ul className="list-disc list-inside ml-6 mt-1">
                <li>Generate tickets for the order</li>
                <li>Increment invite code usage (if applicable)</li>
                <li>Mark order as fulfilled</li>
              </ul>
            </li>
          </ol>
        </div>

        <div className="mt-6 bg-slate-800 rounded-lg p-6">
          <h3 className="font-bold mb-2">📋 Pending Orders from Screenshot</h3>
          <div className="space-y-2 text-sm">
            <button
              onClick={() => setOrderId('35fe4c1a')}
              className="block w-full text-left px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Order #35fe4c1a - $10.00
            </button>
            <button
              onClick={() => setOrderId('26aeef61')}
              className="block w-full text-left px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Order #26aeef61 - $10.00
            </button>
            <button
              onClick={() => setOrderId('f69eee1a')}
              className="block w-full text-left px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded"
            >
              Order #f69eee1a - $20.00
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
