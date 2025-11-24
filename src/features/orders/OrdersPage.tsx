import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
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

// Supported workflow steps for an order. These stay in one spot so both the form and table share the same labels.
const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'awaiting-approval', label: 'Awaiting approval' },
  { value: 'in-production', label: 'In production' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'ready-to-ship', label: 'Ready to ship' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
] as const;

type OrderStatus = (typeof statusOptions)[number]['value'];

interface OrderRecord {
  id: string;
  projectName: string;
  status: OrderStatus;
  customerName: string;
  contactEmail: string;
  notes: string;
  totalValue: number;
  customerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  isSpecificationOrder?: boolean;
  tables?: OrderTable[];
}

interface OrderFormState {
  projectName: string;
  status: OrderStatus;
  customerName: string;
  contactEmail: string;
  notes: string;
  totalValue: string;
}

type OrderFilters = {
  projectName: string;
  status: string;
  customerName: string;
  totalValue: string;
};

interface OrderTable {
  id: string;
  label: string;
  cartItemId?: string | null;
  material?: string | null;
  shape?: string | null;
  dimensions?: string | null;
  quantity?: number | null;
}

type TableColumnKey = Exclude<keyof OrderFilters, 'totalValue'>;

const emptyOrder: OrderFormState = {
  projectName: '',
  status: 'draft',
  customerName: '',
  contactEmail: '',
  notes: '',
  totalValue: ''
};

type SearchableOrderFields = Pick<
  OrderRecord,
  'projectName' | 'customerName' | 'contactEmail' | 'status' | 'notes'
>;

// Build lower-case keywords so orders can be found by the global search experience later on.
const buildSearchKeywords = (order: SearchableOrderFields) => {
  const combined = [
    order.projectName,
    order.customerName,
    order.contactEmail,
    order.status,
    order.notes
  ]
    .join(' ')
    .toLowerCase();
  const tokens = combined
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens));
};

const formatTimestamp = (timestamp?: Timestamp | null) => {
  if (!timestamp) return 'Not available';
  try {
    return timestamp.toDate().toLocaleString();
  } catch (error) {
    console.error('Unable to format timestamp', error);
    return 'Not available';
  }
};

const normaliseTableConfig = (config?: Partial<TabletopConfig>) => ({
  ...defaultTabletopConfig,
  ...config
});

const formatDimensionValue = (value?: number | null) => {
  if (value == null) return '—';
  const rounded = Math.round(value);
  return Number.isFinite(rounded) ? `${rounded}mm` : '—';
};

const formatTableDimensions = (config?: Partial<TabletopConfig>) => {
  if (!config) return 'Size not provided';
  const { shape, lengthMm, widthMm, leftReturnMm, rightReturnMm, internalRadiusMm } = config;

  if (shape === 'round' || shape === 'round-top') {
    const diameter = Math.max(lengthMm ?? 0, widthMm ?? 0);
    return diameter ? `${formatDimensionValue(diameter)} diameter` : 'Size not provided';
  }

  if (shape === 'ninety-degree') {
    return `${formatDimensionValue(lengthMm)} x ${formatDimensionValue(widthMm)} with ${formatDimensionValue(
      leftReturnMm
    )} & ${formatDimensionValue(rightReturnMm)} returns (internal radius ${formatDimensionValue(internalRadiusMm)})`;
  }

  if (shape === 'ellipse' || shape === 'super-ellipse') {
    return `${formatDimensionValue(lengthMm)} x ${formatDimensionValue(widthMm)} (ellipse)`;
  }

  return `${formatDimensionValue(lengthMm)} x ${formatDimensionValue(widthMm)}`;
};

const mapOrderTables = (tables: unknown, orderId: string): OrderTable[] => {
  if (!Array.isArray(tables)) return [];

  return tables
    .map((table, index) => {
      const entry = table as Partial<OrderTable> & { config?: Partial<TabletopConfig> };
      const config = entry.config ? normaliseTableConfig(entry.config) : null;

      return {
        id: entry.id || `${orderId}-table-${index}`,
        label: entry.label || 'Table top',
        cartItemId: entry.cartItemId ?? null,
        material: entry.material ?? config?.material ?? null,
        shape: entry.shape ?? config?.shape ?? null,
        dimensions: entry.dimensions || (config ? formatTableDimensions(config) : null),
        quantity: entry.quantity ?? config?.quantity ?? null
      } satisfies OrderTable;
    })
    .filter(Boolean);
};

const OrdersPage = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  // Normal customers are only allowed to review their past orders, not create or edit new ones on this page.
  const showOrderForm = isAdmin;

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OrderFilters>({
    projectName: '',
    status: '',
    customerName: '',
    totalValue: ''
  });
  const [formState, setFormState] = useState<OrderFormState>(emptyOrder);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [orderTables, setOrderTables] = useState<Record<string, OrderTable[]>>({});
  const [tablesLoadingId, setTablesLoadingId] = useState<string | null>(null);

  // Subscribe to the appropriate slice of the orders collection so customers only see their own documents.
  useEffect(() => {
    if (!profile) return;
    const ordersRef = collection(db, 'orders');
    const constraints = !isAdmin ? [where('customerId', '==', profile.id)] : [];
    const ordersQuery = constraints.length ? query(ordersRef, ...constraints) : query(ordersRef);

    const unsubscribe = onSnapshot(ordersQuery, snapshot => {
      const nextOrders: OrderRecord[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Partial<OrderRecord>;
        return {
          id: docSnap.id,
          projectName: data.projectName || 'Untitled order',
          status: (data.status as OrderStatus) || 'draft',
          customerName: data.customerName || '',
          contactEmail: data.contactEmail || '',
          notes: data.notes || '',
          totalValue: typeof data.totalValue === 'number' ? data.totalValue : 0,
          customerId: data.customerId || '',
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          isSpecificationOrder: data.isSpecificationOrder || false,
          tables: mapOrderTables((data as Record<string, unknown>).tables, docSnap.id)
        };
      });
      setOrders(nextOrders);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile, isAdmin]);

  // Close any open kebab menus when users click elsewhere.
  useEffect(() => {
    const closeMenus = () => setMenuOpenId(null);
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  // Whenever the selected order changes, sync the form state with the Firestore record for easy editing.
  useEffect(() => {
    if (!showOrderForm) return;
    if (!activeOrderId) {
      if (!profile) return;
      const defaultEmail = profile.email || '';
      const defaultName =
        profile.displayName || `${profile.firstName} ${profile.lastName}`.trim() || defaultEmail;
      setFormState({
        ...emptyOrder,
        customerName: defaultName,
        contactEmail: defaultEmail,
        status: 'draft'
      });
      return;
    }

    const match = orders.find(order => order.id === activeOrderId);
    if (match) {
      setFormState({
        projectName: match.projectName,
        status: match.status,
        customerName: match.customerName,
        contactEmail: match.contactEmail,
        notes: match.notes,
        totalValue: match.totalValue ? String(match.totalValue) : ''
      });
    }
  }, [activeOrderId, orders, profile, showOrderForm]);

  const handleFilterChange = (field: keyof OrderFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleFormChange = (field: keyof OrderFormState, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const fetchOrderTables = useCallback(
    async (orderId: string) => {
      setTablesLoadingId(orderId);
      try {
        const cartItemsRef = collection(db, 'cartItems');
        const cartItemsQuery = query(cartItemsRef, where('orderId', '==', orderId));
        const snapshot = await getDocs(cartItemsQuery);

        const tables: OrderTable[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Partial<OrderTable> & { config?: Partial<TabletopConfig> };
          const config = normaliseTableConfig(data.config);

          return {
            id: docSnap.id,
            label: data.label || 'Untitled top',
            cartItemId: docSnap.id,
            material: (data as Record<string, unknown>).material?.toString() || data.material || config.material,
            shape: data.shape || config.shape || null,
            dimensions: formatTableDimensions(config),
            quantity: typeof config.quantity === 'number' ? config.quantity : null
          };
        });

        setOrderTables(prev => ({ ...prev, [orderId]: tables }));
      } catch (error) {
        console.error('Failed to load order tables', error);
      } finally {
        setTablesLoadingId(null);
      }
    },
    []
  );

  useEffect(() => {
    if (!previewOrderId) return;

    const selectedOrder = orders.find(order => order.id === previewOrderId);
    const hasTablesInDoc = selectedOrder?.tables && selectedOrder.tables.length > 0;
    const hasTablesLoaded = orderTables[previewOrderId]?.length;

    if (hasTablesInDoc || hasTablesLoaded) return;
    fetchOrderTables(previewOrderId);
  }, [fetchOrderTables, orderTables, orders, previewOrderId]);

  const startCreateFlow = () => {
    if (!showOrderForm) return;
    setActiveOrderId(null);
    if (!profile) return;
    const defaultEmail = profile.email || '';
    const defaultName =
      profile.displayName || `${profile.firstName} ${profile.lastName}`.trim() || defaultEmail;
    setFormState({
      ...emptyOrder,
      customerName: defaultName,
      contactEmail: defaultEmail,
      status: 'draft'
    });
  };

  const getTablesForOrder = (order: OrderRecord | null) => {
    if (!order) return [] as OrderTable[];
    if (order.tables?.length) return order.tables;
    return orderTables[order.id] || [];
  };

  // Keep the newest orders at the top and then layer the column filters over the data set.
  const filteredOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });

    return sorted.filter(order =>
      Object.entries(filters).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;
        const rawValue =
          key === 'totalValue'
            ? String(order.totalValue ?? '')
            : String((order as unknown as Record<string, unknown>)[key] ?? '');
        const orderValue = rawValue.trim().toLowerCase();
        return orderValue.includes(filterValue);
      })
    );
  }, [orders, filters]);

  const activeOrder = activeOrderId ? orders.find(order => order.id === activeOrderId) : null;
  const previewOrder = previewOrderId ? orders.find(order => order.id === previewOrderId) : null;
  const previewTables = previewOrder ? getTablesForOrder(previewOrder) : [];
  const isLoadingTables = previewOrder ? tablesLoadingId === previewOrder.id : false;

  const handleOrderClick = (orderId: string) => {
    if (showOrderForm) {
      setActiveOrderId(orderId);
    }
    setPreviewOrderId(orderId);
    setIsViewerOpen(true);
  };

  const closeViewer = () => {
    setIsViewerOpen(false);
    setPreviewOrderId(null);
  };

  // Handle both create and update flows with a single submit handler.
  const persistOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !showOrderForm) return;

    setIsSubmitting(true);
    try {
      const projectName = formState.projectName.trim() || 'Untitled order';
      const notes = formState.notes.trim();
      const fallbackEmail = profile.email || '';
      const customerName =
        formState.customerName.trim() || profile.displayName || fallbackEmail || 'Customer';
      const contactEmail = formState.contactEmail.trim() || fallbackEmail;
      const normalizedStatus = formState.status || 'draft';
      const totalValue = parseFloat(formState.totalValue) || 0;
      const customerId = activeOrder?.customerId || profile.id;

      const payload = {
        projectName,
        status: normalizedStatus as OrderStatus,
        customerName,
        contactEmail,
        notes,
        totalValue,
        customerId,
        isSpecificationOrder: activeOrder?.isSpecificationOrder ?? false,
        searchKeywords: buildSearchKeywords({
          projectName,
          customerName,
          contactEmail,
          status: normalizedStatus,
          notes
        }),
        updatedAt: serverTimestamp()
      };

      if (activeOrderId) {
        await updateDoc(doc(db, 'orders', activeOrderId), payload);
      } else {
        await addDoc(collection(db, 'orders'), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      if (!activeOrderId) {
        startCreateFlow();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const targetOrder = orders.find(order => order.id === orderId);
    if (!isAdmin || !targetOrder) return;

    setOrders(prev =>
      prev.map(order => (order.id === orderId ? { ...order, status } : order))
    );

    await updateDoc(doc(db, 'orders', orderId), {
      status,
      updatedAt: serverTimestamp(),
      searchKeywords: buildSearchKeywords({
        projectName: targetOrder.projectName,
        customerName: targetOrder.customerName,
        contactEmail: targetOrder.contactEmail,
        status,
        notes: targetOrder.notes
      })
    });
  };

  // Quickly duplicate an order so estimators can re-use pricing frameworks.
  const cloneOrder = async (order: OrderRecord) => {
    if (!showOrderForm) return;
    const clonedName = `${order.projectName} copy`;
    const { id: _id, ...orderData } = order;
    await addDoc(collection(db, 'orders'), {
      ...orderData,
      projectName: clonedName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      searchKeywords: buildSearchKeywords({
        projectName: clonedName,
        customerName: order.customerName,
        contactEmail: order.contactEmail,
        status: order.status,
        notes: order.notes
      })
    });
  };

  // Remove orders that were created by mistake or merged into another record.
  const deleteOrder = async (orderId: string) => {
    if (!showOrderForm) return;
    await deleteDoc(doc(db, 'orders', orderId));
    if (activeOrderId === orderId) {
      startCreateFlow();
    }
  };

  const tableColumns: {
    key: TableColumnKey;
    label: string;
    placeholder: string;
    helper: string;
  }[] = [
    {
      key: 'projectName',
      label: 'Order',
      placeholder: 'Search project names…',
      helper: 'Filter down to a specific quote, job or reference name.'
    },
    {
      key: 'status',
      label: 'Status',
      placeholder: 'Draft, production…',
      helper: 'Narrow the list to a workflow step.'
    },
    {
      key: 'customerName',
      label: 'Customer',
      placeholder: 'Search contacts…',
      helper: 'Find orders linked to a specific account.'
    }
  ];

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-400">
        <nav className="flex flex-wrap gap-2" aria-label="Breadcrumb">
          <a href="/" className="text-slate-300 hover:text-emerald-300">
            Home
          </a>
          <span>/</span>
          <span className="text-slate-100">Orders</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-300">Order management</p>
        </div>
        {showOrderForm ? (
          <button
            onClick={startCreateFlow}
            className="h-11 rounded-lg bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400"
          >
            Create order
          </button>
        ) : null}
      </div>

      <div
        className={`min-h-[calc(100vh-220px)] gap-6 ${
          showOrderForm ? 'grid lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]' : 'flex flex-col'
        }`}
      >
        <section className="flex min-h-full flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-950/40">
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader />
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-950">
                    <tr>
                      {tableColumns.map(column => (
                        <th key={column.key} className="px-4 py-3 text-xs font-semibold uppercase text-slate-400">
                          <div className="space-y-2">
                            <span>{column.label}</span>
                            <div>
                              <input
                                type="text"
                                value={filters[column.key]}
                                onChange={event => handleFilterChange(column.key, event.target.value)}
                                placeholder={column.placeholder}
                                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                                aria-label={column.label}
                              />
                            </div>
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-400">
                        <div className="space-y-2">
                          <span>Value</span>
                          <div>
                            <input
                              type="text"
                              value={filters.totalValue}
                              onChange={event => handleFilterChange('totalValue', event.target.value)}
                              placeholder="Search amounts…"
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                              aria-label="Estimated value"
                            />
                          </div>
                        </div>
                      </th>
                      {showOrderForm && (
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => (
                      <tr
                        key={order.id}
                        className="cursor-pointer border-t border-slate-800/70 hover:bg-slate-900/40"
                        onClick={() => handleOrderClick(order.id)}
                      >
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-semibold text-emerald-300 hover:underline"
                            onClick={event => {
                              event.stopPropagation();
                              handleOrderClick(order.id);
                            }}
                          >
                            {order.projectName || 'Untitled order'}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {order.isSpecificationOrder && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-emerald-300">
                                Specification order
                              </span>
                            )}
                            <p className="text-xs text-slate-400">
                              {showOrderForm
                                ? 'Tap a name to open the order form.'
                                : 'Order records are view-only here so you can reference past work.'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <select
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-100 focus:border-emerald-400 focus:outline-none"
                              value={order.status}
                              onClick={event => event.stopPropagation()}
                              onChange={event =>
                                updateOrderStatus(order.id, event.target.value as OrderStatus)
                              }
                              aria-label="Update order status"
                            >
                              {statusOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-slate-200">
                              {statusOptions.find(option => option.value === order.status)?.label || order.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-100">{order.customerName || 'Unnamed contact'}</p>
                          <p className="text-xs text-slate-400">{order.contactEmail || 'No email provided'}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {order.totalValue ? currencyFormatter.format(order.totalValue) : '—'}
                        </td>
                        {showOrderForm && (
                          <td className="px-4 py-3 text-right">
                            <div className="relative inline-block text-left" onClick={event => event.stopPropagation()}>
                              <button
                                className="rounded-full p-2 text-slate-300 hover:bg-slate-800"
                                onClick={event => {
                                  event.stopPropagation();
                                  setMenuOpenId(prev => (prev === order.id ? null : order.id));
                                }}
                                aria-label="More options"
                              >
                                ⋮
                              </button>
                              {menuOpenId === order.id && (
                                <div className="absolute right-0 mt-2 w-36 rounded-md border border-slate-800 bg-slate-900 p-1 text-sm shadow-xl">
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800"
                                    onClick={() => cloneOrder(order)}
                                  >
                                    Clone
                                  </button>
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-300 hover:bg-rose-500/10"
                                    onClick={() => deleteOrder(order.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {!filteredOrders.length && (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-sm text-slate-400"
                          colSpan={tableColumns.length + 2 + (showOrderForm ? 1 : 0)}
                        >
                          No orders matched your filters. Clear the search boxes to see everything.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {isViewerOpen && previewOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="absolute inset-0" onClick={closeViewer} />
            <div className="relative z-10 w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl border border-emerald-400/30 bg-slate-950 p-6 shadow-2xl max-h-[calc(100vh-3rem)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Order overview</p>
                  <h3 className="text-xl font-semibold text-slate-50">
                    {previewOrder.projectName || 'Untitled order'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                    <span className="inline-flex items-center rounded-full bg-slate-800/80 px-2 py-0.5 text-xs font-medium text-slate-200">
                      {statusOptions.find(option => option.value === previewOrder.status)?.label || previewOrder.status}
                    </span>
                    {previewOrder.isSpecificationOrder && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-emerald-300">
                        Specification order
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close order overview"
                  onClick={closeViewer}
                  className="rounded-full border border-slate-800 p-2 text-slate-300 transition hover:border-emerald-300 hover:text-emerald-200"
                >
                  ×
                </button>
              </div>

              {showOrderForm && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveOrderId(previewOrder.id);
                    closeViewer();
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20"
                >
                  Edit this order
                </button>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Order details</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[0.75rem] uppercase tracking-wide text-slate-500">Order ID</p>
                      <p className="text-sm font-semibold text-slate-100">{previewOrder.id}</p>
                    </div>
                    <div>
                      <p className="text-[0.75rem] uppercase tracking-wide text-slate-500">Created</p>
                      <p className="text-sm font-semibold text-slate-100">{formatTimestamp(previewOrder.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[0.75rem] uppercase tracking-wide text-slate-500">Last updated</p>
                      <p className="text-sm font-semibold text-slate-100">{formatTimestamp(previewOrder.updatedAt)}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Customer</p>
                  <p className="text-sm font-semibold text-slate-100">{previewOrder.customerName || 'Unnamed contact'}</p>
                  <p className="text-xs text-slate-400">{previewOrder.contactEmail || 'No email provided'}</p>
                </div>
                <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estimated value</p>
                  <p className="text-sm font-semibold text-slate-100">
                    {previewOrder.totalValue ? currencyFormatter.format(previewOrder.totalValue) : 'Not provided'}
                  </p>
                </div>
                <div className="md:col-span-2 space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Tables</p>
                    {isLoadingTables && <Loader />}
                  </div>
                  {previewTables.length ? (
                    <ul className="divide-y divide-slate-800">
                      {previewTables.map(table => (
                        <li key={table.id} className="py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{table.label || 'Table top'}</p>
                              <p className="text-xs text-slate-400">
                                {[table.dimensions || 'Size not provided', table.material || 'Material not set']
                                  .filter(Boolean)
                                  .join(' • ')}
                                {typeof table.quantity === 'number' && table.quantity > 1
                                  ? ` • Qty ${table.quantity}`
                                  : ''}
                              </p>
                            </div>
                            {table.cartItemId ? (
                              <Link
                                to={`/configurator?cartId=${table.cartItemId}`}
                                className="inline-flex items-center justify-center rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
                              >
                                Open in configurator
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-500">Configurator link unavailable</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">No tables are linked to this order yet.</p>
                  )}
                </div>
                <div className="md:col-span-2 space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                    <span className="text-[0.65rem] uppercase tracking-[0.15em] text-slate-500">Read only</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-200">
                    {previewOrder.notes ? previewOrder.notes : 'No notes added yet.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {showOrderForm && (
          <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
            <header className="mb-4">
              <h2 className="text-lg font-semibold">{activeOrderId ? 'Edit order' : 'Create order'}</h2>
              <p className="text-xs text-slate-400">
                Provide enough detail for teammates and manufacturing to understand where the order currently sits.
              </p>
            </header>
            <form className="space-y-4" onSubmit={persistOrder}>
            <div>
              <label className="text-sm font-semibold text-slate-100" htmlFor="order-project-name">
                Order name
              </label>
              <input
                id="order-project-name"
                type="text"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                value={formState.projectName}
                onChange={event => handleFormChange('projectName', event.target.value)}
                placeholder="e.g. Riverside hotel reception desk"
                aria-describedby="order-project-name-help"
              />
              <p id="order-project-name-help" className="mt-1 text-xs text-slate-400">
                Use a descriptive reference so the record is easy to find and confirm with clients later.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-100" htmlFor="order-status">
                Status
              </label>
              <select
                id="order-status"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                value={formState.status}
                onChange={event => handleFormChange('status', event.target.value)}
                aria-describedby="order-status-help"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p id="order-status-help" className="mt-1 text-xs text-slate-400">
                Status updates keep everyone aligned on whether the order is a draft, approved, in production or complete.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-100" htmlFor="order-customer-name">
                Customer name
              </label>
              <input
                id="order-customer-name"
                type="text"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                value={formState.customerName}
                onChange={event => handleFormChange('customerName', event.target.value)}
                placeholder="e.g. Tessa from Northwood Design"
                aria-describedby="order-customer-name-help"
              />
              <p id="order-customer-name-help" className="mt-1 text-xs text-slate-400">
                Capture the person we should follow up with so the global search can surface their projects instantly.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-100" htmlFor="order-contact-email">
                Contact email
              </label>
              <input
                id="order-contact-email"
                type="email"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                value={formState.contactEmail}
                onChange={event => handleFormChange('contactEmail', event.target.value)}
                placeholder="name@company.com"
                aria-describedby="order-contact-email-help"
              />
              <p id="order-contact-email-help" className="mt-1 text-xs text-slate-400">
                This is used for confirmations and also powers the search bar when someone types an email address.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-100" htmlFor="order-total-value">
                Estimated value
              </label>
              <input
                id="order-total-value"
                type="number"
                step="0.01"
                min="0"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                value={formState.totalValue}
                onChange={event => handleFormChange('totalValue', event.target.value)}
                placeholder="15000"
                aria-describedby="order-total-value-help"
              />
              <p id="order-total-value-help" className="mt-1 text-xs text-slate-400">
                Enter the amount (ex tax) so finance can prioritise and filter the pipeline.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-100" htmlFor="order-notes">
                Internal notes
              </label>
              <textarea
                id="order-notes"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                rows={4}
                value={formState.notes}
                onChange={event => handleFormChange('notes', event.target.value)}
                placeholder="Outline install timing, freight preferences or approval details."
                aria-describedby="order-notes-help"
              />
              <p id="order-notes-help" className="mt-1 text-xs text-slate-400">
                The notes are indexed for search so mention spec revisions, delivery windows or anything installers must know.
              </p>
            </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Saving…' : activeOrderId ? 'Save changes' : 'Create order'}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
};

export default OrdersPage;
