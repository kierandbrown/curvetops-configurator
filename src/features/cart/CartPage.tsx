import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '@auth/firebase';
import { useAuth } from '@auth/AuthContext';
import Loader from '@/components/ui/Loader';
import { TableShape, TabletopConfig } from '../configurator/Configurator3D';
import { defaultTabletopConfig } from '../configurator/defaultConfig';
import { buildCartSearchKeywords } from './cartUtils';

interface CartItemRecord {
  id: string;
  label: string;
  config: TabletopConfig;
  customShape: {
    fileName?: string | null;
    notes?: string | null;
  } | null;
  estimatedPrice: number | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface CartFormState {
  label: string;
  material: TabletopConfig['material'];
  finish: TabletopConfig['finish'];
  shape: TableShape;
  lengthMm: string;
  widthMm: string;
  thicknessMm: string;
  edgeRadiusMm: string;
  superEllipseExponent: string;
  quantity: string;
  estimatedPrice: string;
  customFileName: string;
  customNotes: string;
}

interface CartFilters {
  label: string;
  material: string;
  shape: string;
  dimensions: string;
  price: string;
}

const MATERIAL_LABELS: Record<TabletopConfig['material'], string> = {
  laminate: 'High-pressure laminate',
  timber: 'Solid timber',
  linoleum: 'Furniture linoleum'
};

const shapeOptions: { value: TableShape; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'rounded-rect', label: 'Rounded rectangle' },
  { value: 'round-top', label: 'D end top' },
  { value: 'round', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'super-ellipse', label: 'Super ellipse' },
  { value: 'custom', label: 'Custom shape' }
];

const finishOptions: { value: TabletopConfig['finish']; label: string }[] = [
  { value: 'matte', label: 'Matte' },
  { value: 'satin', label: 'Satin' }
];

const emptyForm: CartFormState = {
  label: '',
  material: defaultTabletopConfig.material,
  finish: defaultTabletopConfig.finish,
  shape: defaultTabletopConfig.shape,
  lengthMm: String(defaultTabletopConfig.lengthMm),
  widthMm: String(defaultTabletopConfig.widthMm),
  thicknessMm: String(defaultTabletopConfig.thicknessMm),
  edgeRadiusMm: String(defaultTabletopConfig.edgeRadiusMm),
  superEllipseExponent: String(defaultTabletopConfig.superEllipseExponent),
  quantity: String(defaultTabletopConfig.quantity),
  estimatedPrice: '',
  customFileName: '',
  customNotes: ''
};

const emptyFilters: CartFilters = {
  label: '',
  material: '',
  shape: '',
  dimensions: '',
  price: ''
};

const CartPage = () => {
  const { profile } = useAuth();
  const [cartItems, setCartItems] = useState<CartItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CartFilters>(emptyFilters);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [formState, setFormState] = useState<CartFormState>(emptyForm);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const cartRef = collection(db, 'cartItems');
    const cartQuery = query(cartRef, where('userId', '==', profile.id));

    const unsubscribe = onSnapshot(cartQuery, snapshot => {
      const nextItems: CartItemRecord[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Partial<CartItemRecord> & { config?: Partial<TabletopConfig> };
        const config: TabletopConfig = {
          ...defaultTabletopConfig,
          ...(data.config ?? {})
        } as TabletopConfig;
        return {
          id: docSnap.id,
          label: data.label || 'Untitled top',
          config,
          customShape: data.customShape || null,
          estimatedPrice: typeof data.estimatedPrice === 'number' ? data.estimatedPrice : null,
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null
        };
      });
      setCartItems(nextItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    const closeMenu = () => setMenuOpenId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    if (!activeCartId) {
      setFormState(emptyForm);
      return;
    }

    const match = cartItems.find(item => item.id === activeCartId);
    if (!match) return;
    setFormState({
      label: match.label,
      material: match.config.material,
      finish: match.config.finish,
      shape: match.config.shape,
      lengthMm: String(match.config.lengthMm),
      widthMm: String(match.config.widthMm),
      thicknessMm: String(match.config.thicknessMm),
      edgeRadiusMm: String(match.config.edgeRadiusMm),
      superEllipseExponent: String(match.config.superEllipseExponent),
      quantity: String(match.config.quantity),
      estimatedPrice: match.estimatedPrice ? String(match.estimatedPrice) : '',
      customFileName: match.customShape?.fileName || '',
      customNotes: match.customShape?.notes || ''
    });
  }, [activeCartId, cartItems]);

  const filteredItems = useMemo(() => {
    const sorted = [...cartItems].sort((a, b) => {
      const aDate = a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0;
      const bDate = b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0;
      return bDate - aDate;
    });

    return sorted.filter(item => {
      const dimLabel = `${item.config.lengthMm}x${item.config.widthMm}`.toLowerCase();
      const priceLabel = item.estimatedPrice != null ? item.estimatedPrice.toString() : '';
      return (
        item.label.toLowerCase().includes(filters.label.toLowerCase()) &&
        item.config.material.toLowerCase().includes(filters.material.toLowerCase()) &&
        item.config.shape.toLowerCase().includes(filters.shape.toLowerCase()) &&
        dimLabel.includes(filters.dimensions.toLowerCase()) &&
        priceLabel.includes(filters.price.toLowerCase())
      );
    });
  }, [cartItems, filters]);

  const handleFilterChange = (field: keyof CartFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleFormChange = <K extends keyof CartFormState>(field: K, value: CartFormState[K]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const startCreateFlow = () => {
    setActiveCartId(null);
    setFormState({
      ...emptyForm,
      label: 'Untitled top'
    });
  };

  const saveCartItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setIsSubmitting(true);
    const config: TabletopConfig = {
      shape: formState.shape,
      material: formState.material,
      finish: formState.finish,
      lengthMm: Number(formState.lengthMm) || defaultTabletopConfig.lengthMm,
      widthMm: Number(formState.widthMm) || defaultTabletopConfig.widthMm,
      thicknessMm: Number(formState.thicknessMm) || defaultTabletopConfig.thicknessMm,
      edgeRadiusMm: Number(formState.edgeRadiusMm) || defaultTabletopConfig.edgeRadiusMm,
      superEllipseExponent:
        Number(formState.superEllipseExponent) || defaultTabletopConfig.superEllipseExponent,
      quantity: Number(formState.quantity) || defaultTabletopConfig.quantity
    };

    const materialLabel = MATERIAL_LABELS[config.material];
    const customShape =
      formState.customFileName || formState.customNotes
        ? {
            fileName: formState.customFileName,
            notes: formState.customNotes
          }
        : null;
    const estimatedPrice = formState.estimatedPrice ? Number(formState.estimatedPrice) : null;

    const payload = {
      label: formState.label || 'Untitled top',
      config,
      customShape,
      estimatedPrice,
      searchKeywords: buildCartSearchKeywords(config, materialLabel, customShape),
      updatedAt: serverTimestamp()
    };

    try {
      if (activeCartId) {
        await updateDoc(doc(db, 'cartItems', activeCartId), payload);
      } else {
        await addDoc(collection(db, 'cartItems'), {
          ...payload,
          userId: profile.id,
          createdAt: serverTimestamp()
        });
      }
      setActiveCartId(null);
      setFormState(emptyForm);
    } catch (error) {
      console.error('Failed to save cart item', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClone = async (item: CartItemRecord) => {
    if (!profile) return;
    try {
      await addDoc(collection(db, 'cartItems'), {
        userId: profile.id,
        label: `${item.label} copy`,
        config: item.config,
        customShape: item.customShape,
        estimatedPrice: item.estimatedPrice,
        searchKeywords: buildCartSearchKeywords(
          item.config,
          MATERIAL_LABELS[item.config.material],
          item.customShape
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to clone cart item', error);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'cartItems', itemId));
    } catch (error) {
      console.error('Failed to delete cart item', error);
    }
  };

  if (!profile) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
        Sign in to manage your saved tops.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Saved Tops</p>
          <h1 className="text-2xl font-semibold">Cart</h1>
          <p className="text-sm text-slate-400">
            Review every configuration you saved from the configurator. Search by any column and tap a name to
            update specs before placing an order.
          </p>
          <nav className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Breadcrumb">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-200">Home</span>
            <span className="text-slate-500">/</span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-200">Cart</span>
          </nav>
        </div>
        <button
          type="button"
          onClick={startCreateFlow}
          className="h-fit rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
        >
          Create
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="flex min-h-[calc(100vh-280px)] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-200">Cart items</h2>
            {loading && <Loader />}
          </div>
          <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-4 align-bottom">
                    <div className="flex flex-col gap-2">
                      <span>Name</span>
                      <input
                        type="text"
                        value={filters.label}
                        onChange={e => handleFilterChange('label', e.target.value)}
                        placeholder="Search names"
                        className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                  </th>
                  <th className="p-4 align-bottom">
                    <div className="flex flex-col gap-2">
                      <span>Material</span>
                      <input
                        type="text"
                        value={filters.material}
                        onChange={e => handleFilterChange('material', e.target.value)}
                        placeholder="Search materials"
                        className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                  </th>
                  <th className="p-4 align-bottom">
                    <div className="flex flex-col gap-2">
                      <span>Shape</span>
                      <input
                        type="text"
                        value={filters.shape}
                        onChange={e => handleFilterChange('shape', e.target.value)}
                        placeholder="Search shapes"
                        className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                  </th>
                  <th className="p-4 align-bottom">
                    <div className="flex flex-col gap-2">
                      <span>Dimensions</span>
                      <input
                        type="text"
                        value={filters.dimensions}
                        onChange={e => handleFilterChange('dimensions', e.target.value)}
                        placeholder="e.g. 2000x900"
                        className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                  </th>
                  <th className="p-4 align-bottom">
                    <div className="flex flex-col gap-2">
                      <span>Est. price</span>
                      <input
                        type="text"
                        value={filters.price}
                        onChange={e => handleFilterChange('price', e.target.value)}
                        placeholder="Search $"
                        className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                  </th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/70 bg-slate-950">
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm text-slate-400">
                      No cart items matched your filters. Clear the search inputs to show everything again.
                    </td>
                  </tr>
                )}
                {filteredItems.map(item => {
                  const materialLabel = MATERIAL_LABELS[item.config.material];
                  return (
                    <tr key={item.id} className="hover:bg-slate-900/30">
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            setActiveCartId(item.id);
                          }}
                          className="text-left text-emerald-300 hover:underline"
                        >
                          {item.label}
                        </button>
                        <p className="text-xs text-slate-500">
                          Updated {item.updatedAt ? item.updatedAt.toDate().toLocaleDateString() : '—'}
                        </p>
                      </td>
                      <td className="p-4 text-slate-200">{materialLabel}</td>
                      <td className="p-4 text-slate-200">{item.config.shape}</td>
                      <td className="p-4 text-slate-200">
                        {item.config.lengthMm} × {item.config.widthMm} mm
                      </td>
                      <td className="p-4 text-slate-200">
                        {item.estimatedPrice != null
                          ? item.estimatedPrice.toLocaleString('en-AU', {
                              style: 'currency',
                              currency: 'AUD'
                            })
                          : '—'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              setMenuOpenId(prev => (prev === item.id ? null : item.id));
                            }}
                            aria-label="More actions"
                            className="rounded-full border border-slate-700 p-1 text-slate-200 hover:border-emerald-400"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              className="h-4 w-4"
                            >
                              <path d="M12 5h.01" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M12 12h.01" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M12 19h.01" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          {menuOpenId === item.id && (
                            <div className="absolute right-0 z-10 mt-2 w-32 rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm shadow-xl">
                              <button
                                type="button"
                                className="block w-full rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800"
                                onClick={event => {
                                  event.stopPropagation();
                                  setMenuOpenId(null);
                                  handleClone(item);
                                }}
                              >
                                Clone
                              </button>
                              <button
                                type="button"
                                className="mt-1 block w-full rounded px-2 py-1 text-left text-red-300 hover:bg-slate-800"
                                onClick={event => {
                                  event.stopPropagation();
                                  setMenuOpenId(null);
                                  handleDelete(item.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-sm font-semibold text-slate-200">{activeCartId ? 'Edit cart item' : 'Create cart item'}</h2>
          <p className="text-xs text-slate-400">
            Use the form to tweak a saved configuration before checkout. Each field includes guidance so every entry can be
            found via the global search bar.
          </p>
          <form onSubmit={saveCartItem} className="mt-4 space-y-4 text-sm text-slate-200">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Display name</span>
              <input
                type="text"
                value={formState.label}
                onChange={e => handleFormChange('label', e.target.value)}
                placeholder="e.g. Staff room table"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                required
              />
              <p className="text-xs text-slate-400">
                Give the top a descriptive name so your search bar can locate it using common project language.
              </p>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Material</span>
              <select
                value={formState.material}
                onChange={e =>
                  handleFormChange('material', e.target.value as TabletopConfig['material'])
                }
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              >
                  {Object.entries(MATERIAL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">Choose the surface finish so future searches can match by material.</p>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Finish</span>
              <select
                value={formState.finish}
                onChange={e => handleFormChange('finish', e.target.value as TabletopConfig['finish'])}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              >
                  {finishOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">Finish is stored with the cart item so installers know the sheen level.</p>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Shape</span>
              <select
                value={formState.shape}
                onChange={e => handleFormChange('shape', e.target.value as TableShape)}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              >
                {shapeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">Selecting the right outline keeps dimensions accurate across the team.</p>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Length (mm)</span>
                <input
                  type="number"
                  value={formState.lengthMm}
                  onChange={e => handleFormChange('lengthMm', e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <p className="text-xs text-slate-400">Enter the longest edge so freight and pricing stay correct.</p>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Width (mm)</span>
                <input
                  type="number"
                  value={formState.widthMm}
                  onChange={e => handleFormChange('widthMm', e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <p className="text-xs text-slate-400">Record the short edge so searches like “900mm” work instantly.</p>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Thickness (mm)</span>
                <input
                  type="number"
                  value={formState.thicknessMm}
                  onChange={e => handleFormChange('thicknessMm', e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <p className="text-xs text-slate-400">Thickness is indexed so the search bar can distinguish benchtop builds.</p>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Edge radius (mm)</span>
                <input
                  type="number"
                  value={formState.edgeRadiusMm}
                  onChange={e => handleFormChange('edgeRadiusMm', e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <p className="text-xs text-slate-400">Rounded corners are saved with the cart so installers know the trim.</p>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Super ellipse exponent</span>
                <input
                  type="number"
                  step="0.1"
                  value={formState.superEllipseExponent}
                  onChange={e => handleFormChange('superEllipseExponent', e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <p className="text-xs text-slate-400">Only used on super ellipses but saved for completeness.</p>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Quantity</span>
                <input
                  type="number"
                  value={formState.quantity}
                  onChange={e => handleFormChange('quantity', e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
                />
                <p className="text-xs text-slate-400">Quantities are searchable so repeating builds can be grouped.</p>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Estimated price (AUD)</span>
              <input
                type="number"
                value={formState.estimatedPrice}
                onChange={e => handleFormChange('estimatedPrice', e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <p className="text-xs text-slate-400">Optional but helpful when prioritising batches in the cart.</p>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Custom file name</span>
              <input
                type="text"
                value={formState.customFileName}
                onChange={e => handleFormChange('customFileName', e.target.value)}
                placeholder="e.g. staff-room-table.dxf"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              />
              <p className="text-xs text-slate-400">Add the DXF/DWG file name so searches can locate uploaded outlines.</p>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Notes for installers</span>
              <textarea
                value={formState.customNotes}
                onChange={e => handleFormChange('customNotes', e.target.value)}
                className="min-h-[100px] rounded border border-slate-700 bg-slate-950 px-3 py-2"
                placeholder="List scribing, cut-outs or delivery reminders"
              />
              <p className="text-xs text-slate-400">
                Notes sync with the search index so typing “power box” or similar will highlight the right top.
              </p>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : activeCartId ? 'Save changes' : 'Add to cart'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default CartPage;
