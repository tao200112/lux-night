/**
 * Admin Ambassador Management Page
 * /ambassadors
 */

'use client';

import { useEffect, useState } from 'react';
import AdminTopBar from '@/components/admin/AdminTopBar';
import PageContainer from '@/components/admin/PageContainer';
import { Skeleton } from '@/components/admin/Skeleton';
import EmptyState from '@/components/admin/EmptyState';
import ErrorState from '@/components/admin/ErrorState';
import StatusBadge from '@/components/admin/StatusBadge';
import AdminButton from '@/components/admin/AdminButton';

interface Ambassador {
  id: string;
  name: string;
  status: string;
  merchant: { id: string; name: string } | null;
  codes: Array<{ id: string; code: string; used: number; max: number | null; active: boolean }>;
  createdAt: string;
}

interface MerchantOption {
  id: string;
  name: string;
}

export default function AmbassadorsPage() {
  const [loading, setLoading] = useState(true);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState<{ show: boolean; ambassadorId: string | null }>({ show: false, ambassadorId: null });

  // Forms
  const [createForm, setCreateForm] = useState({ name: '', merchantId: '' });
  const [codeForm, setCodeForm] = useState({ code: '', maxUses: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ambRes, merchRes] = await Promise.all([
          fetch('/api/admin/ambassadors'),
          fetch('/api/admin/merchants?status=active') // Assuming this endpoint exists and returns list
      ]);
      
      const ambData = await ambRes.json();
      const merchData = await merchRes.json();
      
      if (!ambData.ok) throw new Error(ambData.error || 'Failed to fetch ambassadors');
      
      setAmbassadors(ambData.data || []);
      
      // Handle merchants list format from API
      if (merchData.ok && merchData.data && Array.isArray(merchData.data.merchants)) {
          setMerchants(merchData.data.merchants.map((m: any) => ({ id: m.id, name: m.name })));
      }
      
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAmbassador = async () => {
      try {
          setSubmitting(true);
          const res = await fetch('/api/admin/ambassadors', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(createForm)
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error);
          
          setShowCreateModal(false);
          setCreateForm({ name: '', merchantId: '' });
          fetchData();
      } catch (e: any) {
          alert(e.message);
      } finally {
          setSubmitting(false);
      }
  };

  const handleAddCode = async () => {
      try {
          setSubmitting(true);
          const res = await fetch('/api/admin/ambassador-invites', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                  ambassadorId: showCodeModal.ambassadorId,
                  code: codeForm.code,
                  maxUses: codeForm.maxUses ? parseInt(codeForm.maxUses) : null
              })
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error);
          
          setShowCodeModal({ show: false, ambassadorId: null });
          setCodeForm({ code: '', maxUses: '' });
          fetchData(); 
      } catch (e: any) {
          alert(e.message);
      } finally {
          setSubmitting(false);
      }
  };

  const generateRandomCode = () => {
      // Simple random code
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let r = '';
      for(let i=0; i<8; i++) r += chars.charAt(Math.floor(Math.random()*chars.length));
      setCodeForm(prev => ({ ...prev, code: r }));
  };

  return (
    <PageContainer className="bg-background-light dark:bg-background-dark">
      <AdminTopBar title="Ambassadors" showBack />
      
      <main className="px-4 py-6">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">All Ambassadors</h2>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-hover shadow-sm"
              >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  New Ambassador
              </button>
          </div>

          {loading ? (
             <div className="space-y-4">
                 {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
             </div>
          ) : error ? (
              <ErrorState message={error} onRetry={fetchData} />
          ) : ambassadors.length === 0 ? (
              <EmptyState 
                icon="badge" 
                title="No Ambassadors Yet" 
                description="Create your first ambassador to generate invite codes." 
              />
          ) : (
              <div className="space-y-4">
                  {ambassadors.map((amb) => (
                      <div key={amb.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                              <div>
                                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">{amb.name}</h3>
                                  <p className="text-sm text-slate-500 dark:text-slate-400">
                                      {amb.merchant?.name || 'Unknown Merchant'}
                                  </p>
                              </div>
                              <StatusBadge status={amb.status as any} />
                          </div>
                          
                          {/* Codes List */}
                          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 space-y-2">
                              {amb.codes.length > 0 ? (
                                  amb.codes.map(code => (
                                      <div key={code.id} className="flex justify-between items-center text-sm border-b last:border-0 border-slate-100 dark:border-slate-700 pb-2 last:pb-0 mb-2 last:mb-0">
                                          <div className="flex items-center gap-2">
                                              <span className="font-mono font-bold text-primary dark:text-blue-400">{code.code}</span>
                                              {!code.active && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">Inactive</span>}
                                          </div>
                                          <div className="text-slate-500 dark:text-slate-400 text-xs">
                                              {code.used} / {code.max || '∞'} uses
                                              <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(code.code);
                                                    alert('Copied!');
                                                }}
                                                className="ml-2 text-slate-400 hover:text-primary"
                                              >
                                                  <span className="material-symbols-outlined text-[14px] align-middle">content_copy</span>
                                              </button>
                                          </div>
                                      </div>
                                  ))
                              ) : (
                                  <p className="text-xs text-slate-400 italic">No active codes</p>
                              )}
                              
                              <button 
                                onClick={() => setShowCodeModal({ show: true, ambassadorId: amb.id })}
                                className="w-full mt-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-dashed border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1"
                              >
                                  <span className="material-symbols-outlined text-[14px]">add</span>
                                  Add Code
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          )}
      </main>

      {/* Create Ambassador Modal */}
      {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
              <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">New Ambassador</h3>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                          <input 
                            value={createForm.name}
                            onChange={e => setCreateForm({...createForm, name: e.target.value})}
                            placeholder="e.g. John Doe"
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Merchant</label>
                          <select
                            value={createForm.merchantId}
                            onChange={e => setCreateForm({...createForm, merchantId: e.target.value})}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                          >
                              <option value="">Select Merchant...</option>
                              {merchants.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                          </select>
                      </div>
                      
                      <div className="flex gap-3 mt-6">
                            <AdminButton variant="outline" fullWidth onClick={() => setShowCreateModal(false)}>Cancel</AdminButton>
                            <AdminButton 
                                variant="primary" 
                                fullWidth 
                                onClick={handleCreateAmbassador}
                                loading={submitting}
                                disabled={!createForm.name || !createForm.merchantId}
                            >
                                Create
                            </AdminButton>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Add Code Modal */}
      {showCodeModal.show && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowCodeModal({ show: false, ambassadorId: null })}>
              <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Add Invite Code</h3>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Code</label>
                          <div className="flex gap-2">
                              <input 
                                value={codeForm.code}
                                onChange={e => setCodeForm({...codeForm, code: e.target.value.toUpperCase()})}
                                placeholder="e.g. SUMMER20"
                                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none font-mono uppercase"
                              />
                              <button 
                                onClick={generateRandomCode}
                                className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-medium text-xs"
                              >
                                  Random
                              </button>
                          </div>
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Uses (Optional)</label>
                          <input 
                            type="number"
                            value={codeForm.maxUses}
                            onChange={e => setCodeForm({...codeForm, maxUses: e.target.value})}
                            placeholder="Unlimited"
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                          />
                      </div>
                      
                      <div className="flex gap-3 mt-6">
                            <AdminButton variant="outline" fullWidth onClick={() => setShowCodeModal({ show: false, ambassadorId: null })}>Cancel</AdminButton>
                            <AdminButton 
                                variant="primary" 
                                fullWidth 
                                onClick={handleAddCode}
                                loading={submitting}
                                disabled={!codeForm.code}
                            >
                                Add Code
                            </AdminButton>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </PageContainer>
  );
}
