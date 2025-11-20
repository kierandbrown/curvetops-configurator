import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '@auth/firebase';
import { useAuth } from '@auth/AuthContext';
import Loader from '@/components/ui/Loader';
import { TabletopConfig } from '../configurator/Configurator3D';
import { defaultTabletopConfig } from '../configurator/defaultConfig';
import CartTopPreview from './CartTopPreview';
import { buildCartSearchKeywords } from './cartUtils';

interface CartItemRecord {
  id: string;
  label: string;
  config: TabletopConfig;
  selectedColour:
    | {
        id?: string;
        name?: string;
        materialType?: string;
        finish?: string;
        supplierSku?: string;
        hexCode?: string | null;
        imageUrl?: string | null;
        maxLength?: number | null;
        maxWidth?: number | null;
        availableThicknesses?: number[] | null;
      }
    | null;
  customShape: {
    fileName?: string | null;
    notes?: string | null;
  } | null;
  estimatedPrice: number | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

interface CartFilters {
  label: string;
  colour: string;
  finish: string;
  shape: string;
  dimensions: string;
  price: string;
  fileName: string;
}

const MATERIAL_LABELS: Record<TabletopConfig['material'], string> = {
  laminate: 'High-pressure laminate',
  timber: 'Solid timber',
  linoleum: 'Furniture linoleum'
};

const emptyFilters: CartFilters = {
  label: '',
  colour: '',
  finish: '',
  shape: '',
  dimensions: '',
  price: '',
  fileName: ''
};

const CartPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CartFilters>(emptyFilters);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  // Keep a simple flag for showing action buttons in the UI instead of
  // recalculating lengths inline for every render.
  const hasCartItems = cartItems.length > 0;

  const clampQuantity = (value: number) => Math.min(Math.max(Math.round(value), 1), 999);

  const normaliseQuantity = (value: unknown) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return clampQuantity(parsed);
  };

  // Sync the cart list for the authenticated user. Every entry is normalised with
  // the default table config so the UI can always render complete rows.
  useEffect(() => {
    if (!profile) return;
    const cartRef = collection(db, 'cartItems');
    // Order cart rows by when they were first created so edits do not reshuffle the list.
    const cartQuery = query(cartRef, where('userId', '==', profile.id), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(cartQuery, snapshot => {
      const nextItems: CartItemRecord[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Partial<CartItemRecord> & { config?: Partial<TabletopConfig> };
        const rawConfig: Partial<TabletopConfig> = data.config ?? {};
        const config: TabletopConfig = {
          ...defaultTabletopConfig,
          ...rawConfig,
          quantity: normaliseQuantity(rawConfig.quantity ?? defaultTabletopConfig.quantity)
        } as TabletopConfig;
        return {
          id: docSnap.id,
          label: data.label || 'Untitled top',
          config,
          selectedColour: data.selectedColour || null,
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

  // Make sure the selection list never holds stale cart IDs after Firestore updates.
  useEffect(() => {
    setSelectedItemIds(prev => prev.filter(id => cartItems.some(item => item.id === id)));
  }, [cartItems]);

  useEffect(() => {
    const closeMenu = () => setMenuOpenId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const filteredItems = useMemo(() => {
    // Preserve the original add order even after quantity tweaks or label updates.
    const sorted = [...cartItems].sort((a, b) => {
      const aDate = a.createdAt?.toMillis() || 0;
      const bDate = b.createdAt?.toMillis() || 0;
      if (aDate === bDate) {
        return a.id.localeCompare(b.id);
      }
      return aDate - bDate;
    });

    return sorted.filter(item => {
      const dimLabel = `${item.config.lengthMm}x${item.config.widthMm}`.toLowerCase();
      const priceLabel = item.estimatedPrice != null ? item.estimatedPrice.toString() : '';
      const customFileTokens = `${item.customShape?.fileName ?? ''} ${item.customShape?.notes ?? ''}`.toLowerCase();
      const colourLabel = (item.selectedColour?.name ?? '').toLowerCase();
      const finishLabel = (item.selectedColour?.finish ?? '').toLowerCase();
      const shapeLabel = item.config.shape.toLowerCase();
      return (
        item.label.toLowerCase().includes(filters.label.toLowerCase()) &&
        colourLabel.includes(filters.colour.toLowerCase()) &&
        finishLabel.includes(filters.finish.toLowerCase()) &&
        shapeLabel.includes(filters.shape.toLowerCase()) &&
        dimLabel.includes(filters.dimensions.toLowerCase()) &&
        priceLabel.includes(filters.price.toLowerCase()) &&
        customFileTokens.includes(filters.fileName.toLowerCase())
      );
    });
  }, [cartItems, filters]);

  // Calculate a running total based on the filtered list so the summary always
  // mirrors what the user sees on screen.
  const { pricedCount, totalEstimatedValue } = useMemo(() => {
    const pricedItems = filteredItems.filter(item => typeof item.estimatedPrice === 'number');
    // Multiply by quantity so cart totals stay in sync with inline adjustments.
    const total = pricedItems.reduce((sum, item) => {
      const quantity = item.config.quantity ?? 1;
      return sum + (item.estimatedPrice ?? 0) * quantity;
    }, 0);
    return { pricedCount: pricedItems.length, totalEstimatedValue: total };
  }, [filteredItems]);

  const handleFilterChange = (field: keyof CartFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = async (itemId: string) => {
    // Optimistically update the UI so removed items disappear immediately while Firestore catches up.
    setCartItems(prev => prev.filter(item => item.id !== itemId));
    setSelectedItemIds(prev => prev.filter(id => id !== itemId));
    try {
      await deleteDoc(doc(db, 'cartItems', itemId));
    } catch (error) {
      console.error('Failed to delete cart item', error);
    }
  };

  // Build extra search keywords from the stored colour metadata so quantity updates
  // keep the global search bar in sync with the latest item details.
  const buildColourSearchKeywords = (
    selectedColour: CartItemRecord['selectedColour']
  ): string[] => {
    const rawTerms = [
      selectedColour?.name,
      selectedColour?.materialType,
      selectedColour?.finish,
      selectedColour?.supplierSku
    ];

    return rawTerms.filter((term): term is string => Boolean(term)).map(term => term.toString());
  };

  const updateQuantity = async (item: CartItemRecord, nextQuantity: number) => {
    const clampedQuantity = normaliseQuantity(nextQuantity);
    const nextConfig = { ...item.config, quantity: clampedQuantity };

    const searchKeywords = buildCartSearchKeywords(
      nextConfig,
      MATERIAL_LABELS[item.config.material],
      item.customShape,
      item.label,
      buildColourSearchKeywords(item.selectedColour)
    );

    try {
      await updateDoc(doc(db, 'cartItems', item.id), {
        'config.quantity': clampedQuantity,
        searchKeywords,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to update quantity', error);
    }
  };

  // Apply a numeric input change directly to Firestore so the inline controls and
  // the persisted cart stay aligned.
  const handleQuantityInput = (item: CartItemRecord, value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }
    updateQuantity(item, parsed);
  };

  const handleQuantityStep = (item: CartItemRecord, delta: number) => {
    const currentQuantity = normaliseQuantity(item.config.quantity);
    updateQuantity(item, currentQuantity + delta);
  };

  const handleBulkDelete = async () => {
    const idsToDelete = selectedItemIds;
    // Remove the selected IDs right away so the table refreshes without waiting for Firestore roundtrips.
    setCartItems(prev => prev.filter(item => !idsToDelete.includes(item.id)));
    // Delete each selected item in parallel, then reset the selection so the UI stays tidy.
    const deletions = idsToDelete.map(id => deleteDoc(doc(db, 'cartItems', id)));
    try {
      await Promise.all(deletions);
      setSelectedItemIds([]);
    } catch (error) {
      console.error('Failed to delete selected cart items', error);
    }
  };

  const toggleSelection = (itemId: string) => {
    setSelectedItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredItems.map(item => item.id);
    const everyFilteredSelected = filteredIds.every(id => selectedItemIds.includes(id));
    setSelectedItemIds(prev => {
      if (everyFilteredSelected) {
        // Unselect only the filtered rows, leaving any hidden selections untouched for clarity.
        return prev.filter(id => !filteredIds.includes(id));
      }
      // Merge the filtered IDs with any existing selections without creating duplicates.
      const merged = new Set([...prev, ...filteredIds]);
      return Array.from(merged);
    });
  };

  // Send customers to the orders view so they can confirm their purchase
  // details and follow the approval workflow with the saved tops.
  const handlePlaceOrder = () => {
    navigate('/orders');
  };

  const handleNameClick = (itemId: string) => {
    // Send the user back to the configurator so they can edit or duplicate the
    // selection there. Passing the cartId lets the downstream page load context
    // without letting people create brand new items inside the cart itself.
    navigate(`/configurator?cartId=${itemId}`, { state: { cartItemId: itemId } });
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
      <header className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs uppercase tracking-widest text-slate-500">Cart</p>
        <nav className="flex flex-wrap gap-2 text-xs text-slate-500" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden="true">/</span>
          <span className="text-slate-200">Cart</span>
        </nav>
      </header>

      <section className="flex min-h-[calc(100vh-200px)] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Cart items</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={selectedItemIds.length === 0}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:text-red-100 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
            >
              Delete selected ({selectedItemIds.length})
            </button>
            {loading && <Loader />}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="w-10 p-4 align-bottom">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      aria-label="Select all visible cart items"
                      checked={filteredItems.length > 0 && filteredItems.every(item => selectedItemIds.includes(item.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
                    />
                  </label>
                </th>
                <th className="p-4 align-bottom text-slate-300">Preview</th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Name</span>
                    <input
                      id="cart-filter-name"
                      type="text"
                      value={filters.label}
                      onChange={e => handleFilterChange('label', e.target.value)}
                      placeholder="Search names"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Colour</span>
                    <input
                      id="cart-filter-colour"
                      type="text"
                      value={filters.colour}
                      onChange={e => handleFilterChange('colour', e.target.value)}
                      placeholder="Search colours"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Finish</span>
                    <input
                      id="cart-filter-finish"
                      type="text"
                      value={filters.finish}
                      onChange={e => handleFilterChange('finish', e.target.value)}
                      placeholder="Search finishes"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Shape</span>
                    <input
                      id="cart-filter-shape"
                      type="text"
                      value={filters.shape}
                      onChange={e => handleFilterChange('shape', e.target.value)}
                      placeholder="Search shapes"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Dimensions</span>
                    <input
                      id="cart-filter-dimensions"
                      type="text"
                      value={filters.dimensions}
                      onChange={e => handleFilterChange('dimensions', e.target.value)}
                      placeholder="e.g. 2000x900"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Est. price</span>
                    <input
                      id="cart-filter-price"
                      type="text"
                      value={filters.price}
                      onChange={e => handleFilterChange('price', e.target.value)}
                      placeholder="Search $"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">Qty</span>
                    <p className="text-[0.65rem] text-slate-500">Quantity saved with each configuration.</p>
                  </div>
                </th>
                <th className="p-4 align-bottom">
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-slate-400">DXF / notes</span>
                    <input
                      id="cart-filter-file"
                      type="text"
                      value={filters.fileName}
                      onChange={e => handleFilterChange('fileName', e.target.value)}
                      placeholder="Search file names"
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
                    />
                  </div>
                </th>
                <th className="p-4 text-right align-bottom">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/70 bg-slate-950">
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-sm text-slate-400">
                    No cart items matched your filters. Clear the search inputs to show everything again.
                  </td>
                </tr>
              )}
              {filteredItems.map(item => {
                const currentQuantity = normaliseQuantity(item.config.quantity);
                return (
                  <tr key={item.id} className="hover:bg-slate-900/30">
                    <td className="p-4 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.label}`}
                        checked={selectedItemIds.includes(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
                      />
                    </td>
                    <td className="p-4 align-middle">
                      {/* Inline previews provide a quick visual of each top without reopening the 3D scene. */}
                      <CartTopPreview
                        config={item.config}
                        label={item.label}
                        selectedColour={item.selectedColour}
                      />
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          handleNameClick(item.id);
                        }}
                        className="text-left text-emerald-300 hover:underline"
                      >
                        {item.label}
                      </button>
                      <p className="text-xs text-slate-500">
                        Updated {item.updatedAt ? item.updatedAt.toDate().toLocaleDateString() : '—'}
                      </p>
                    </td>
                    <td className="p-4 text-slate-200">{item.selectedColour?.name ?? 'Not selected'}</td>
                    <td className="p-4 text-slate-200">{item.selectedColour?.finish ?? 'Not selected'}</td>
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
                    <td className="p-4 text-slate-200">
                      <div className="flex items-center gap-2">
                        {currentQuantity <= 1 ? (
                          <button
                            type="button"
                            aria-label={`Remove ${item.label} from cart`}
                            onClick={() => handleDelete(item.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-400/70 bg-red-500/10 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 hover:text-red-100"
                          >
                            {/* When the quantity reaches one, switch the decrement control to a destructive remove action. */}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              className="h-4 w-4"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7m4 4v6m4-6v6"
                              />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${item.label}`}
                            onClick={() => handleQuantityStep(item, -1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-100 transition hover:border-emerald-400 hover:text-emerald-300"
                          >
                            −
                          </button>
                        )}
                        <div className="flex flex-col">
                          <input
                            type="number"
                            min={1}
                            max={999}
                            inputMode="numeric"
                            aria-label={`Quantity for ${item.label}`}
                            value={currentQuantity}
                            onChange={event => handleQuantityInput(item, event.target.value)}
                            className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-center text-sm font-semibold text-slate-100 transition focus:border-emerald-400 focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Increase quantity for ${item.label}`}
                          onClick={() => handleQuantityStep(item, 1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-100 transition hover:border-emerald-400 hover:text-emerald-300"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="p-4 text-slate-200">
                      {item.customShape?.fileName ? (
                        <>
                          <p className="font-medium text-slate-100">{item.customShape.fileName}</p>
                          {item.customShape?.notes && (
                            <p className="text-xs text-slate-500">{item.customShape.notes}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">No DXF uploaded</p>
                      )}
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
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                            <path d="M12 5h.01" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 12h.01" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 19h.01" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {menuOpenId === item.id && (
                          <div className="absolute right-0 z-10 mt-2 w-32 rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm shadow-xl">
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
        <div className="border-t border-slate-800 bg-slate-900/50 px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">Summary</p>
              <p className="text-sm text-slate-300">
                Showing {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                {pricedCount > 0 ? ` with ${pricedCount} priced` : ''}.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-right sm:w-1/2 sm:items-end">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">Estimated total</p>
                <p className="text-xl font-semibold text-emerald-300">
                  {pricedCount > 0
                    ? totalEstimatedValue.toLocaleString('en-AU', {
                        style: 'currency',
                        currency: 'AUD'
                      })
                    : 'Awaiting prices'}
                </p>
                <p className="text-xs text-slate-500">Only items with an estimated price are counted.</p>
              </div>
              <div className="flex w-full flex-col items-end gap-1 sm:w-auto">
                {/* Placing the action near the summary keeps checkout context close to pricing. */}
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={!hasCartItems}
                  className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 sm:w-auto"
                >
                  Place order
                </button>
                <p className="text-[0.65rem] text-slate-500">
                  Jump to orders to submit the saved tops when you are ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CartPage;
