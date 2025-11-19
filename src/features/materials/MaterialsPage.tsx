import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '@auth/firebase';
import { useAuth } from '@auth/AuthContext';
import Loader from '@/components/ui/Loader';

interface MaterialInput {
  name: string;
  materialType: string;
  finish: string;
  colorFamily: string;
  hexCode: string;
  notes: string;
}

interface MaterialRecord extends MaterialInput {
  id: string;
}

const emptyMaterial: MaterialInput = {
  name: '',
  materialType: '',
  finish: '',
  colorFamily: '',
  hexCode: '#ffffff',
  notes: ''
};

const buildSearchKeywords = (material: MaterialInput): string[] => {
  const combinedValues = [
    material.name,
    material.materialType,
    material.finish,
    material.colorFamily,
    material.hexCode,
    material.notes
  ];
  const words = combinedValues
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter(Boolean);

  return Array.from(new Set(words));
};

const MaterialsPage: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    name: '',
    materialType: '',
    finish: '',
    colorFamily: ''
  });
  const [formState, setFormState] = useState<MaterialInput>(emptyMaterial);
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    const materialsQuery = query(collection(db, 'materials'), orderBy('name'));
    const unsubscribe = onSnapshot(materialsQuery, snapshot => {
      const nextMaterials: MaterialRecord[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as MaterialInput)
      }));
      setMaterials(nextMaterials);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!activeMaterialId) return;
    const match = materials.find(material => material.id === activeMaterialId);
    if (match) {
      setFormState(match);
    }
  }, [activeMaterialId, materials]);

  useEffect(() => {
    const closeMenus = () => setMenuOpenId(null);
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  const filteredMaterials = useMemo(() => {
    return materials.filter(material =>
      Object.entries(filters).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;
        const materialValue = String(material[key as keyof typeof filters] || '')
          .toLowerCase()
          .trim();
        return materialValue.includes(filterValue);
      })
    );
  }, [materials, filters]);

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleNameClick = (material: MaterialRecord) => {
    setActiveMaterialId(material.id);
    setFormState(material);
  };

  const startCreateFlow = () => {
    setActiveMaterialId(null);
    setFormState(emptyMaterial);
  };

  const handleFormChange = (field: keyof MaterialInput, value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const persistMaterial = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;

    setIsSubmitting(true);
    try {
      const sanitizedHex = formState.hexCode.startsWith('#')
        ? formState.hexCode
        : `#${formState.hexCode}`;
      const trimmedNotes = formState.notes.trim();
      const baseMaterial: MaterialInput = {
        ...formState,
        hexCode: sanitizedHex.toUpperCase(),
        notes: trimmedNotes
      };
      const payload = {
        ...baseMaterial,
        searchKeywords: buildSearchKeywords(baseMaterial),
        updatedAt: serverTimestamp()
      };

      if (activeMaterialId) {
        await updateDoc(doc(db, 'materials', activeMaterialId), payload);
      } else {
        await addDoc(collection(db, 'materials'), payload);
      }
      if (!activeMaterialId) {
        setFormState(emptyMaterial);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const cloneMaterial = async (material: MaterialRecord) => {
    if (!isAdmin) return;
    const { id: _id, ...base } = material;
    const clonedMaterial: MaterialInput = {
      ...base,
      name: `${material.name} copy`
    };
    await addDoc(collection(db, 'materials'), {
      ...clonedMaterial,
      searchKeywords: buildSearchKeywords(clonedMaterial),
      updatedAt: serverTimestamp()
    });
  };

  const deleteMaterial = async (materialId: string) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, 'materials', materialId));
    if (activeMaterialId === materialId) {
      setActiveMaterialId(null);
      setFormState(emptyMaterial);
    }
  };

  const tableColumns: {
    key: keyof typeof filters;
    label: string;
    placeholder: string;
    helper: string;
  }[] = [
    {
      key: 'name',
      label: 'Colour name',
      placeholder: 'Search names…',
      helper: 'Type any part of the colour name to filter the list.'
    },
    {
      key: 'materialType',
      label: 'Material type',
      placeholder: 'Laminate, timber…',
      helper: 'Filter materials by their core substrate or supplier category.'
    },
    {
      key: 'finish',
      label: 'Finish',
      placeholder: 'Gloss, matte…',
      helper: 'Limit the table to a specific sheen or surface treatment.'
    },
    {
      key: 'colorFamily',
      label: 'Colour family',
      placeholder: 'Neutrals, greens…',
      helper: 'Group colours into the palette family you need right now.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-400">
        <nav className="flex flex-wrap gap-2" aria-label="Breadcrumb">
          <a href="/" className="text-slate-300 hover:text-emerald-300">
            Home
          </a>
          <span>/</span>
          <span className="text-slate-100">Material library</span>
        </nav>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-300">Material selection</p>
          <h1 className="text-3xl font-semibold">Colour catalogue</h1>
          <p className="text-sm text-slate-300">
            Search our saved colours, view finishes and, if you are an admin, keep
            the library up to date.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={startCreateFlow}
            className="h-11 rounded-lg bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400"
          >
            Create colour
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] min-h-[calc(100vh-220px)]">
        <section className="flex min-h-full flex-col rounded-2xl border border-slate-800 bg-slate-950/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <p className="text-sm font-semibold">Stored colours</p>
            <p className="text-xs text-slate-400">
              The table stays pinned to the viewport height so you always have the palette in view.
            </p>
          </header>
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
                      <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-400">Preview</th>
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
                              <p className="mt-1 text-[0.65rem] text-slate-400">{column.helper}</p>
                            </div>
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map(material => (
                      <tr
                        key={material.id}
                        className="border-t border-slate-800/70 hover:bg-slate-900/40"
                      >
                        <td className="px-4 py-3">
                          <div className="h-8 w-8 rounded-md border border-white/10" style={{ backgroundColor: material.hexCode }} />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-semibold text-emerald-300 hover:underline"
                            onClick={event => {
                              event.stopPropagation();
                              handleNameClick(material);
                            }}
                          >
                            {material.name || 'Untitled colour'}
                          </button>
                          <p className="text-xs text-slate-400">Tap a name to edit the record.</p>
                        </td>
                        <td className="px-4 py-3 text-slate-200">{material.materialType || '—'}</td>
                        <td className="px-4 py-3 text-slate-200">{material.finish || '—'}</td>
                        <td className="px-4 py-3 text-slate-200">{material.colorFamily || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {isAdmin ? (
                            <div className="relative inline-block text-left" onClick={event => event.stopPropagation()}>
                              <button
                                className="rounded-full p-2 text-slate-300 hover:bg-slate-800"
                                onClick={event => {
                                  event.stopPropagation();
                                  setMenuOpenId(prev => (prev === material.id ? null : material.id));
                                }}
                                aria-label="More options"
                              >
                                ⋮
                              </button>
                              {menuOpenId === material.id && (
                                <div className="absolute right-0 mt-2 w-36 rounded-md border border-slate-800 bg-slate-900 p-1 text-sm shadow-xl">
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800"
                                    onClick={() => cloneMaterial(material)}
                                  >
                                    Clone
                                  </button>
                                  <button
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-300 hover:bg-rose-500/10"
                                    onClick={() => deleteMaterial(material.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">View only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredMaterials.length && (
                      <tr>
                        <td
                          className="px-4 py-6 text-center text-sm text-slate-400"
                          colSpan={tableColumns.length + 2}
                        >
                          No colours matched your filters. Clear the search boxes to see everything.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
          <header className="mb-4">
            <h2 className="text-lg font-semibold">
              {activeMaterialId ? 'Edit colour' : 'Create colour'}
            </h2>
            <p className="text-xs text-slate-400">
              {isAdmin
                ? 'Fill in the form with descriptive help text so future searches are meaningful.'
                : 'Sign in with an admin account to manage colours.'}
            </p>
          </header>
          {isAdmin ? (
            <form className="space-y-4" onSubmit={persistMaterial}>
              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-name">
                  Colour name
                </label>
                <input
                  id="material-name"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.name}
                  onChange={event => handleFormChange('name', event.target.value)}
                  placeholder="e.g. Eucalyptus Silk"
                  aria-describedby="material-name-help"
                />
                <p id="material-name-help" className="mt-1 text-xs text-slate-400">
                  Use the supplier friendly name so other team members can easily search for the same finish.
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-type">
                  Material type
                </label>
                <input
                  id="material-type"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.materialType}
                  onChange={event => handleFormChange('materialType', event.target.value)}
                  placeholder="Laminate, veneer, solid surface…"
                  aria-describedby="material-type-help"
                />
                <p id="material-type-help" className="mt-1 text-xs text-slate-400">
                  Describe the core material (laminate, solid timber, etc.) to keep pricing rules accurate.
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-finish">
                  Finish
                </label>
                <input
                  id="material-finish"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.finish}
                  onChange={event => handleFormChange('finish', event.target.value)}
                  placeholder="Matte, velvet, high gloss…"
                  aria-describedby="material-finish-help"
                />
                <p id="material-finish-help" className="mt-1 text-xs text-slate-400">
                  Explain how the surface feels or reflects light so specifiers can filter by look.
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-family">
                  Colour family
                </label>
                <input
                  id="material-family"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.colorFamily}
                  onChange={event => handleFormChange('colorFamily', event.target.value)}
                  placeholder="Earthy greens, warm neutrals…"
                  aria-describedby="material-family-help"
                />
                <p id="material-family-help" className="mt-1 text-xs text-slate-400">
                  Group similar hues (neutrals, pastels, bolds) to make the search inputs more powerful.
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-hex">
                  HEX colour code
                </label>
                <input
                  id="material-hex"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.hexCode}
                  onChange={event => handleFormChange('hexCode', event.target.value)}
                  placeholder="#AABBCC"
                  aria-describedby="material-hex-help"
                />
                <p id="material-hex-help" className="mt-1 text-xs text-slate-400">
                  Paste a valid HEX value so we can render the swatch preview accurately across the app.
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-notes">
                  Notes
                </label>
                <textarea
                  id="material-notes"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  rows={4}
                  value={formState.notes}
                  onChange={event => handleFormChange('notes', event.target.value)}
                  placeholder="Supplier SKU, edge band availability, minimum order notes…"
                  aria-describedby="material-notes-help"
                />
                <p id="material-notes-help" className="mt-1 text-xs text-slate-400">
                  These notes appear in the search index, so list anything installers or estimators need to know.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {activeMaterialId ? 'Save changes' : 'Create colour'}
                </button>
                <button
                  type="button"
                  onClick={startCreateFlow}
                  className="text-sm text-slate-400 hover:text-slate-200"
                >
                  Clear form
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              You currently have read-only access. Ask an admin to elevate your account so you can curate the colour
              collection.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MaterialsPage;
