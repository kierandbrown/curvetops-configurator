import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  QueryConstraint,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { useAuth } from '@auth/AuthContext';
import { db } from '@auth/firebase';
import Loader from '@/components/ui/Loader';
import { openSpecificationPrintView } from './specificationPrint';
import { CartSpecification, DEFAULT_COMMISSION_RATE, SpecificationStatus } from './specificationTypes';

interface SpecificationFilters {
  search: string;
  status: '' | SpecificationStatus;
}

interface SpecificationEditForm {
  status: SpecificationStatus;
  convertedOrderValue: string;
  linkedOrderId: string;
  notes: string;
}

const statusLabels: Record<SpecificationStatus, string> = {
  draft: 'Draft',
  shared: 'Shared with buyer',
  converted: 'Converted to order'
};

const statusBadgeColors: Record<SpecificationStatus, string> = {
  draft: 'bg-slate-800 text-slate-100 border-slate-700',
  shared: 'bg-blue-500/10 text-blue-200 border-blue-400/60',
  converted: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/60'
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '—';
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
};

const SpecificationsPage = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [specifications, setSpecifications] = useState<CartSpecification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SpecificationFilters>({ search: '', status: '' });
  const [activeSpecificationId, setActiveSpecificationId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SpecificationEditForm>({
    status: 'draft',
    convertedOrderValue: '',
    linkedOrderId: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const specificationsRef = collection(db, 'specifications');
    const constraints: QueryConstraint[] = [];

    if (!isAdmin) {
      constraints.push(where('userId', '==', profile.id));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    const specificationsQuery = query(specificationsRef, ...constraints);

    const unsubscribe = onSnapshot(specificationsQuery, snapshot => {
      const nextSpecs: CartSpecification[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Partial<CartSpecification>;
        return {
          id: docSnap.id,
          userId: data.userId || '',
          jobName: data.jobName || 'Untitled job',
          jobAddress: data.jobAddress || '',
          buyerName: data.buyerName || '',
          buyerCompany: data.buyerCompany || '',
          specifierName: data.specifierName || '',
          specifierCompany: data.specifierCompany || '',
          notes: data.notes || '',
          items: data.items || [],
          cartItemCount: data.cartItemCount || (data.items?.length ?? 0),
          totalEstimatedValue: data.totalEstimatedValue ?? 0,
          status: (data.status as SpecificationStatus) || 'draft',
          linkedOrderId: data.linkedOrderId ?? null,
          convertedOrderValue: data.convertedOrderValue ?? null,
          commissionRate: data.commissionRate ?? DEFAULT_COMMISSION_RATE,
          commissionDue: data.commissionDue ?? null,
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });

      setSpecifications(nextSpecs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile, isAdmin]);

  useEffect(() => {
    const selected = specifications.find(spec => spec.id === activeSpecificationId);
    if (!selected) return;

    setEditForm({
      status: selected.status,
      convertedOrderValue:
        selected.convertedOrderValue != null ? selected.convertedOrderValue.toString() : '',
      linkedOrderId: selected.linkedOrderId || '',
      notes: selected.notes || ''
    });
  }, [activeSpecificationId, specifications]);

  const filteredSpecifications = useMemo(() => {
    const search = filters.search.toLowerCase();
    return specifications.filter(spec => {
      const matchesStatus = filters.status ? spec.status === filters.status : true;
      const combined = `${spec.jobName} ${spec.buyerName} ${spec.buyerCompany} ${spec.specifierName}`.toLowerCase();
      const matchesSearch = combined.includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [filters, specifications]);

  const activeSpecification = useMemo(
    () => specifications.find(spec => spec.id === activeSpecificationId) || null,
    [activeSpecificationId, specifications]
  );

  const derivedCommissionDue = (spec: CartSpecification) => {
    if (spec.commissionDue != null) return spec.commissionDue;
    if (spec.status === 'converted' && spec.convertedOrderValue != null) {
      return spec.convertedOrderValue * spec.commissionRate;
    }
    return null;
  };

  const handleFilterChange = (field: keyof SpecificationFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectSpecification = (specId: string) => {
    setActiveSpecificationId(specId);
  };

  const handleUpdateSpecification = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeSpecification) return;

    const parsedOrderValue = Number(editForm.convertedOrderValue);
    const hasOrderValue = Number.isFinite(parsedOrderValue);
    const commissionDue =
      editForm.status === 'converted' && hasOrderValue
        ? parsedOrderValue * (activeSpecification.commissionRate || DEFAULT_COMMISSION_RATE)
        : null;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'specifications', activeSpecification.id), {
        status: editForm.status,
        convertedOrderValue: hasOrderValue ? parsedOrderValue : null,
        linkedOrderId: editForm.linkedOrderId.trim() || null,
        notes: editForm.notes.trim(),
        commissionDue,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update specification', error);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
        Sign in to review saved specifications.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Saved specifications</p>
          <h1 className="text-xl font-semibold text-slate-100">Cart specifications</h1>
          <p className="text-sm text-slate-400">
            Capture job context for architects and specifiers, then track which carts convert into orders.
          </p>
        </div>
        <div className="flex gap-2 text-sm text-slate-300">
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">Total specs</p>
            <p className="text-lg font-semibold text-slate-50">{specifications.length}</p>
          </div>
          <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-emerald-200">Converted</p>
            <p className="text-lg font-semibold text-emerald-100">
              {specifications.filter(spec => spec.status === 'converted').length}
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col text-sm text-slate-200">
            <span className="mb-1 text-xs uppercase tracking-wider text-slate-500">Search</span>
            <input
              type="text"
              value={filters.search}
              onChange={event => handleFilterChange('search', event.target.value)}
              placeholder="Job, buyer or specifier"
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-200">
            <span className="mb-1 text-xs uppercase tracking-wider text-slate-500">Status</span>
            <select
              value={filters.status}
              onChange={event => handleFilterChange('status', event.target.value as SpecificationStatus | '')}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="shared">Shared</option>
              <option value="converted">Converted</option>
            </select>
          </label>
          <div className="flex items-end justify-end text-sm text-slate-400">
            {loading && <Loader />}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800">
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Job</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Buyer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Tops</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Estimated value</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Commission</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                {filteredSpecifications.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                      No specifications found. Start from the cart to save a job brief.
                    </td>
                  </tr>
                )}
                {filteredSpecifications.map(spec => {
                  const commissionDue = derivedCommissionDue(spec);
                  return (
                    <tr
                      key={spec.id}
                      className={`cursor-pointer transition hover:bg-slate-800/50 ${
                        spec.id === activeSpecificationId ? 'bg-slate-800/60' : ''
                      }`}
                      onClick={() => handleSelectSpecification(spec.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-50">{spec.jobName}</p>
                        <p className="text-xs text-slate-400">{spec.jobAddress || 'No address provided'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        <p className="font-medium">{spec.buyerName || 'Unknown contact'}</p>
                        <p className="text-xs text-slate-500">{spec.buyerCompany || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{spec.cartItemCount}</td>
                      <td className="px-4 py-3 text-slate-200">{formatCurrency(spec.totalEstimatedValue)}</td>
                      <td className="px-4 py-3 text-slate-200">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                            statusBadgeColors[spec.status]
                          }`}
                        >
                          {statusLabels[spec.status]}
                        </span>
                        {spec.linkedOrderId && (
                          <p className="mt-1 text-xs text-emerald-200">Order: {spec.linkedOrderId}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {commissionDue != null ? (
                          <div>
                            <p className="font-semibold text-emerald-200">{formatCurrency(commissionDue)}</p>
                            <p className="text-xs text-slate-500">{(spec.commissionRate * 100).toFixed(1)}% of order</p>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">Waiting for order value</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              setActiveSpecificationId(spec.id);
                              openSpecificationPrintView(spec);
                            }}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-400"
                          >
                            Download PDF
                          </button>
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              setActiveSpecificationId(spec.id);
                            }}
                            className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300"
                          >
                            Update status
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {activeSpecification && (
        <section className="rounded-3xl border border-emerald-400/40 bg-emerald-500/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Specification details</p>
              <h2 className="text-lg font-semibold text-slate-50">{activeSpecification.jobName}</h2>
              <p className="text-sm text-slate-200">{activeSpecification.items.length} tops saved</p>
              <p className="text-sm text-slate-400">Specifier: {activeSpecification.specifierName || '—'}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Summary</p>
              <p className="text-lg font-semibold text-emerald-200">{formatCurrency(activeSpecification.totalEstimatedValue)}</p>
              <p className="text-xs text-slate-400">Converted order value drives commission.</p>
            </div>
          </div>

          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleUpdateSpecification}>
            <label className="flex flex-col text-sm text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wider text-slate-500">Status</span>
              <select
                value={editForm.status}
                onChange={event => setEditForm(prev => ({ ...prev, status: event.target.value as SpecificationStatus }))}
                className="rounded-lg border border-emerald-400/40 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300 focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="shared">Shared with buyer</option>
                <option value="converted">Converted to order</option>
              </select>
            </label>
            <label className="flex flex-col text-sm text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wider text-slate-500">Order value (AUD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editForm.convertedOrderValue}
                onChange={event => setEditForm(prev => ({ ...prev, convertedOrderValue: event.target.value }))}
                placeholder="Enter the confirmed order total"
                className="rounded-lg border border-emerald-400/40 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300 focus:outline-none"
              />
              <span className="mt-1 text-xs text-slate-500">Commission is calculated once an order value is provided.</span>
            </label>
            <label className="flex flex-col text-sm text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wider text-slate-500">Linked order ID</span>
              <input
                type="text"
                value={editForm.linkedOrderId}
                onChange={event => setEditForm(prev => ({ ...prev, linkedOrderId: event.target.value }))}
                placeholder="Optional order or PO reference"
                className="rounded-lg border border-emerald-400/40 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300 focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-200 md:col-span-2">
              <span className="mb-1 text-xs uppercase tracking-wider text-slate-500">Internal notes</span>
              <textarea
                value={editForm.notes}
                onChange={event => setEditForm(prev => ({ ...prev, notes: event.target.value }))}
                rows={3}
                placeholder="Record how this specification was shared or any commission decisions"
                className="rounded-lg border border-emerald-400/40 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-300 focus:outline-none"
              />
            </label>
            <div className="md:col-span-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveSpecificationId(null)}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {saving ? 'Saving…' : 'Save updates'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
};

export default SpecificationsPage;
