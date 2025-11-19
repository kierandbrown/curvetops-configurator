import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@auth/firebase';
import { useAuth } from '@auth/AuthContext';
import Loader from '@/components/ui/Loader';

interface MaterialInput {
  name: string;
  materialType: string;
  finish: string;
  hexCode: string;
  supplierSku: string;
  maxLength: string;
  maxWidth: string;
  availableThicknesses: string[];
  imageUrl: string;
  notes: string;
}

interface MaterialRecord extends MaterialInput {
  id: string;
}

type FilterKeys =
  | 'name'
  | 'materialType'
  | 'finish'
  | 'supplierSku'
  | 'maxLength'
  | 'maxWidth'
  | 'availableThicknesses';

const emptyMaterial: MaterialInput = {
  name: '',
  materialType: '',
  finish: '',
  hexCode: '#ffffff',
  supplierSku: '',
  maxLength: '',
  maxWidth: '',
  availableThicknesses: [],
  imageUrl: '',
  notes: ''
};

const materialTypeOptions = ['Melamine', 'Veneer', 'Solid Surface', 'Linoleum'];
const thicknessOptions = ['12', '16', '18', '25', '32', '33'];
const initialFilters: Record<FilterKeys, string> = {
  name: '',
  materialType: '',
  finish: '',
  supplierSku: '',
  maxLength: '',
  maxWidth: '',
  availableThicknesses: ''
};

const buildSearchKeywords = (material: MaterialInput): string[] => {
  const combinedValues = [
    material.name,
    material.materialType,
    material.finish,
    material.hexCode,
    material.supplierSku,
    material.maxLength,
    material.maxWidth,
    material.availableThicknesses.join(' '),
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
  const [filters, setFilters] = useState<Record<FilterKeys, string>>(initialFilters);
  const [formState, setFormState] = useState<MaterialInput>(emptyMaterial);
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    const materialsQuery = query(collection(db, 'materials'), orderBy('name'));
    const unsubscribe = onSnapshot(materialsQuery, snapshot => {
      const nextMaterials: MaterialRecord[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Partial<MaterialInput>;
        return {
          id: docSnap.id,
          ...emptyMaterial,
          ...data,
          availableThicknesses: data.availableThicknesses || [],
          imageUrl: data.imageUrl || ''
        };
      });
      setMaterials(nextMaterials);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!activeMaterialId) return;
    const match = materials.find(material => material.id === activeMaterialId);
    if (match) {
      setFormState({
        ...emptyMaterial,
        ...match,
        availableThicknesses: match.availableThicknesses || []
      });
      setImagePreview(match.imageUrl || '');
      setPendingImageFile(null);
    }
  }, [activeMaterialId, materials]);

  useEffect(() => {
    const closeMenus = () => setMenuOpenId(null);
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const filteredMaterials = useMemo(() => {
    return materials.filter(material =>
      Object.entries(filters).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;
        const rawValue = material[key as keyof typeof filters];
        if (Array.isArray(rawValue)) {
          return rawValue.some(option => option.toLowerCase().includes(filterValue));
        }
        const materialValue = String(rawValue || '')
          .toLowerCase()
          .trim();
        return materialValue.includes(filterValue);
      })
    );
  }, [materials, filters]);

  const handleFilterChange = (field: FilterKeys, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleNameClick = (material: MaterialRecord) => {
    setActiveMaterialId(material.id);
    setFormState({
      ...emptyMaterial,
      ...material,
      availableThicknesses: material.availableThicknesses || []
    });
    setImagePreview(material.imageUrl || '');
    setPendingImageFile(null);
  };

  const startCreateFlow = () => {
    setActiveMaterialId(null);
    setFormState(emptyMaterial);
    setPendingImageFile(null);
    setImagePreview('');
  };

  const handleFormChange = (field: keyof MaterialInput, value: string | string[]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleThicknessChange = (options: HTMLSelectElement) => {
    const values = Array.from(options.selectedOptions).map(option => option.value);
    handleFormChange('availableThicknesses', values);
  };

  const handleImageSelection = (file: File | null) => {
    if (!file) {
      setPendingImageFile(null);
      setImagePreview(formState.imageUrl || '');
      return;
    }

    if (!file.type.startsWith('image/')) {
      console.warn('Unsupported file type.');
      return;
    }

    setPendingImageFile(file);
    const nextPreview = URL.createObjectURL(file);
    setImagePreview(nextPreview);
  };

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    handleImageSelection(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0] || null;
    handleImageSelection(file);
  };

  const clearImage = () => {
    setPendingImageFile(null);
    setImagePreview('');
    handleFormChange('imageUrl', '');
  };

  const persistMaterial = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;

    setIsSubmitting(true);
    try {
      let imageUrl = formState.imageUrl;
      if (pendingImageFile) {
        const fileRef = ref(storage, `materials/${Date.now()}_${pendingImageFile.name}`);
        const uploadResult = await uploadBytes(fileRef, pendingImageFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      const sanitizedHex = formState.hexCode.startsWith('#')
        ? formState.hexCode
        : `#${formState.hexCode}`;
      const trimmedNotes = formState.notes.trim();
      const sanitizedSupplierSku = formState.supplierSku.trim();
      const sanitizedMaxLength = formState.maxLength.trim();
      const sanitizedMaxWidth = formState.maxWidth.trim();
      const sanitizedThicknesses = formState.availableThicknesses.filter(Boolean);
      const baseMaterial: MaterialInput = {
        ...formState,
        hexCode: sanitizedHex.toUpperCase(),
        supplierSku: sanitizedSupplierSku,
        maxLength: sanitizedMaxLength,
        maxWidth: sanitizedMaxWidth,
        availableThicknesses: sanitizedThicknesses,
        imageUrl,
        notes: trimmedNotes
      };
      const payload = {
        ...baseMaterial,
        searchKeywords: buildSearchKeywords(baseMaterial),
        updatedAt: serverTimestamp()
      };

      if (activeMaterialId) {
        await updateDoc(doc(db, 'materials', activeMaterialId), payload);
        setFormState(baseMaterial);
        setImagePreview(imageUrl);
      } else {
        await addDoc(collection(db, 'materials'), payload);
        setFormState(emptyMaterial);
        setImagePreview('');
      }
      setPendingImageFile(null);
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
      setPendingImageFile(null);
      setImagePreview('');
    }
  };

  const tableColumns: {
    key: FilterKeys;
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
      placeholder: 'Melamine, veneer…',
      helper: 'Filter materials by their core substrate or supplier category.'
    },
    {
      key: 'finish',
      label: 'Finish',
      placeholder: 'Gloss, matte…',
      helper: 'Limit the table to a specific sheen or surface treatment.'
    },
    {
      key: 'supplierSku',
      label: 'Supplier SKU',
      placeholder: 'SKU, code…',
      helper: 'Search by catalogue or supplier code when ordering replacements.'
    },
    {
      key: 'maxLength',
      label: 'Maximum length',
      placeholder: 'e.g. 3600mm',
      helper: 'Filter by blank length to match island and benchtop spans.'
    },
    {
      key: 'maxWidth',
      label: 'Maximum width',
      placeholder: 'e.g. 1350mm',
      helper: 'Quickly find sheets wide enough for your design.'
    },
    {
      key: 'availableThicknesses',
      label: 'Thicknesses',
      placeholder: '12, 16, 18…',
      helper: 'Enter a number to see all finishes stocked in that thickness.'
    }
  ];

  const renderTableCell = (material: MaterialRecord, key: FilterKeys) => {
    const sharedClass = 'text-slate-200';
    switch (key) {
      case 'name':
        return (
          <div>
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
          </div>
        );
      case 'availableThicknesses':
        return (
          <div className={sharedClass}>
            {material.availableThicknesses.length
              ? `${material.availableThicknesses.join(', ')} mm`
              : '—'}
          </div>
        );
      default: {
        const value = material[key];
        return <span className={sharedClass}>{value ? value : '—'}</span>;
      }
    }
  };

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
                          <div className="flex flex-col gap-2">
                            <div className="h-12 w-12 overflow-hidden rounded-md border border-white/10 bg-slate-900">
                              {material.imageUrl ? (
                                <img
                                  src={material.imageUrl}
                                  alt={`${material.name} swatch`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div
                                  className="h-full w-full"
                                  style={{ backgroundColor: material.hexCode }}
                                />
                              )}
                            </div>
                            <p className="text-[0.65rem] uppercase tracking-wide text-slate-500">
                              {material.hexCode}
                            </p>
                          </div>
                        </td>
                        {tableColumns.map(column => (
                          <td key={column.key} className="px-4 py-3">
                            {renderTableCell(material, column.key)}
                          </td>
                        ))}
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
                <select
                  id="material-type"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.materialType}
                  onChange={event => handleFormChange('materialType', event.target.value)}
                  aria-describedby="material-type-help"
                >
                  <option value="">Select a substrate…</option>
                  {materialTypeOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p id="material-type-help" className="mt-1 text-xs text-slate-400">
                  Pick from the standard list (melamine, veneer, solid surface or linoleum) so pricing and cut lists stay
                  aligned.
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
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-sku">
                  Supplier SKU
                </label>
                <input
                  id="material-sku"
                  type="text"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.supplierSku}
                  onChange={event => handleFormChange('supplierSku', event.target.value)}
                  placeholder="e.g. MELA-12345"
                  aria-describedby="material-sku-help"
                />
                <p id="material-sku-help" className="mt-1 text-xs text-slate-400">
                  Add the supplier code exactly as it appears on the order sheet so procurement can search and cross
                  check fast.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-100" htmlFor="material-max-length">
                    Maximum length
                  </label>
                  <input
                    id="material-max-length"
                    type="text"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    value={formState.maxLength}
                    onChange={event => handleFormChange('maxLength', event.target.value)}
                    placeholder="e.g. 3600mm"
                    aria-describedby="material-max-length-help"
                  />
                  <p id="material-max-length-help" className="mt-1 text-xs text-slate-400">
                    Note the maximum blank length so designers know which spans need joins.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-100" htmlFor="material-max-width">
                    Maximum width
                  </label>
                  <input
                    id="material-max-width"
                    type="text"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    value={formState.maxWidth}
                    onChange={event => handleFormChange('maxWidth', event.target.value)}
                    placeholder="e.g. 1350mm"
                    aria-describedby="material-max-width-help"
                  />
                  <p id="material-max-width-help" className="mt-1 text-xs text-slate-400">
                    Capture the usable sheet width so quoting knows when a benchtop needs to be laminated up.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-thicknesses">
                  Available thicknesses
                </label>
                <select
                  id="material-thicknesses"
                  multiple
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={formState.availableThicknesses}
                  onChange={event => handleThicknessChange(event.currentTarget)}
                  aria-describedby="material-thicknesses-help"
                >
                  {thicknessOptions.map(option => (
                    <option key={option} value={option}>
                      {option} mm
                    </option>
                  ))}
                </select>
                <p id="material-thicknesses-help" className="mt-1 text-xs text-slate-400">
                  Hold Ctrl (Windows) or Command (Mac) while clicking to select every stocked thickness that applies.
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
                <label className="text-sm font-semibold text-slate-100" htmlFor="material-image">
                  Swatch image
                </label>
                <div
                  className={`mt-2 flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm transition ${
                    isDraggingFile ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    id="material-image"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleImageInputChange}
                  />
                  <label htmlFor="material-image" className="cursor-pointer font-semibold text-emerald-300">
                    Drag & drop or click to upload
                  </label>
                  <p className="mt-1 text-xs text-slate-400">
                    Drop a high quality supplier swatch so the preview matches the physical sheet.
                  </p>
                  {imagePreview && (
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <img
                        src={imagePreview}
                        alt="Selected swatch preview"
                        className="h-24 w-24 rounded-md border border-white/10 object-cover"
                      />
                      <button type="button" className="text-xs text-rose-300 hover:text-rose-200" onClick={clearImage}>
                        Remove image
                      </button>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  You can drag a file from your desktop straight onto this panel—perfect when saving client supplied
                  imagery.
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
                  placeholder="Edge band availability, matching panels, delivery lead times, fabrication tips…"
                  aria-describedby="material-notes-help"
                />
                <p id="material-notes-help" className="mt-1 text-xs text-slate-400">
                  These notes appear in the search index, so include anything installers, estimators or drafters should
                  know.
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
