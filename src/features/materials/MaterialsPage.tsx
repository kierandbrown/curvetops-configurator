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

// Describes the dimensions that apply to each stocked thickness.
interface ThicknessDimension {
  thickness: string;
  maxLength: string;
  maxWidth: string;
}

interface MaterialInput {
  name: string;
  materialType: string;
  finish: string;
  hexCode: string;
  supplierSku: string;
  thicknessDimensions: ThicknessDimension[];
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
  | 'thicknessDimensions'
  | 'lengthDetails'
  | 'widthDetails';

const emptyMaterial: MaterialInput = {
  name: '',
  materialType: '',
  finish: '',
  hexCode: '#ffffff',
  supplierSku: '',
  thicknessDimensions: [],
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
  thicknessDimensions: '',
  lengthDetails: '',
  widthDetails: ''
};

const buildSearchKeywords = (material: MaterialInput): string[] => {
  const combinedValues = [
    material.name,
    material.materialType,
    material.finish,
    material.hexCode,
    material.supplierSku,
    material.thicknessDimensions
      .map(dimension => `${dimension.thickness} ${dimension.maxLength} ${dimension.maxWidth}`)
      .join(' '),
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
        const data = docSnap.data() as Partial<MaterialInput> & {
          availableThicknesses?: string[];
          maxLength?: string;
          maxWidth?: string;
          thicknessDimensions?: ThicknessDimension[];
        };
        // Normalise any legacy single-value fields into the new per-thickness structure.
        const normalizedDimensions = (() => {
          if (Array.isArray(data.thicknessDimensions) && data.thicknessDimensions.length) {
            return data.thicknessDimensions.map(dimension => ({
              thickness: dimension.thickness || '',
              maxLength: dimension.maxLength || '',
              maxWidth: dimension.maxWidth || ''
            }));
          }

          if (Array.isArray(data.availableThicknesses) && data.availableThicknesses.length) {
            return data.availableThicknesses.map(thicknessValue => ({
              thickness: thicknessValue || '',
              maxLength: data.maxLength || '',
              maxWidth: data.maxWidth || ''
            }));
          }

          if (data.maxLength || data.maxWidth) {
            return [
              {
                thickness: '',
                maxLength: data.maxLength || '',
                maxWidth: data.maxWidth || ''
              }
            ];
          }

          return [];
        })();
        return {
          id: docSnap.id,
          ...emptyMaterial,
          ...data,
          thicknessDimensions: normalizedDimensions,
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
        thicknessDimensions: match.thicknessDimensions.map(dimension => ({ ...dimension }))
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
      (Object.entries(filters) as [FilterKeys, string][]).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;

        switch (key) {
          case 'thicknessDimensions':
            return material.thicknessDimensions.some(dimension =>
              dimension.thickness.toLowerCase().includes(filterValue)
            );
          case 'lengthDetails':
            return material.thicknessDimensions.some(dimension =>
              `${dimension.thickness} ${dimension.maxLength}`.toLowerCase().includes(filterValue)
            );
          case 'widthDetails':
            return material.thicknessDimensions.some(dimension =>
              `${dimension.thickness} ${dimension.maxWidth}`.toLowerCase().includes(filterValue)
            );
          default: {
            const rawValue = material[key as keyof MaterialRecord];
            return String(rawValue || '')
              .toLowerCase()
              .includes(filterValue);
          }
        }
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
      thicknessDimensions: material.thicknessDimensions.map(dimension => ({ ...dimension }))
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

  const handleFormChange = <K extends keyof MaterialInput>(field: K, value: MaterialInput[K]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  // Helpers that manage the variable thickness rows.
  const addThicknessDimension = () => {
    handleFormChange('thicknessDimensions', [
      ...formState.thicknessDimensions,
      { thickness: '', maxLength: '', maxWidth: '' }
    ]);
  };

  const updateThicknessDimension = (
    index: number,
    field: keyof ThicknessDimension,
    value: string
  ) => {
    handleFormChange(
      'thicknessDimensions',
      formState.thicknessDimensions.map((dimension, currentIndex) =>
        currentIndex === index ? { ...dimension, [field]: value } : dimension
      )
    );
  };

  const removeThicknessDimension = (index: number) => {
    handleFormChange(
      'thicknessDimensions',
      formState.thicknessDimensions.filter((_, currentIndex) => currentIndex !== index)
    );
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
      const sanitizedDimensions = formState.thicknessDimensions
        .map(dimension => ({
          thickness: dimension.thickness.trim(),
          maxLength: dimension.maxLength.trim(),
          maxWidth: dimension.maxWidth.trim()
        }))
        .filter(dimension => dimension.thickness || dimension.maxLength || dimension.maxWidth);
      const baseMaterial: MaterialInput = {
        ...formState,
        hexCode: sanitizedHex.toUpperCase(),
        supplierSku: sanitizedSupplierSku,
        thicknessDimensions: sanitizedDimensions,
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
      key: 'lengthDetails',
      label: 'Maximum length',
      placeholder: 'e.g. 16mm 3600',
      helper: 'Include a thickness or measurement to narrow the rows.'
    },
    {
      key: 'widthDetails',
      label: 'Maximum width',
      placeholder: 'e.g. 18mm 1500',
      helper: 'Search by thickness or span to find wide enough sheets.'
    },
    {
      key: 'thicknessDimensions',
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
      case 'thicknessDimensions':
        return (
          <div className={sharedClass}>
            {material.thicknessDimensions.length ? (
              <ul className="space-y-1 text-xs text-slate-300">
                {material.thicknessDimensions.map((dimension, index) => (
                  <li key={`${material.id}-thickness-${index}`}>
                    {dimension.thickness ? `${dimension.thickness} mm` : 'Unspecified thickness'}
                  </li>
                ))}
              </ul>
            ) : (
              '—'
            )}
          </div>
        );
      case 'lengthDetails':
      case 'widthDetails': {
        const measurementKey = key === 'lengthDetails' ? 'maxLength' : 'maxWidth';
        return (
          <div className={sharedClass}>
            {material.thicknessDimensions.length ? (
              <ul className="space-y-1 text-xs text-slate-300">
                {material.thicknessDimensions.map((dimension, index) => (
                  <li key={`${material.id}-${measurementKey}-${index}`}>
                    <span className="font-semibold text-slate-100">
                      {dimension.thickness ? `${dimension.thickness} mm` : 'Unspecified thickness'}
                    </span>
                    <span className="text-slate-500"> · </span>
                    <span>{dimension[measurementKey] || '—'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              '—'
            )}
          </div>
        );
      }
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

              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="text-sm font-semibold text-slate-100">
                      Thickness-specific sheet sizes
                    </label>
                    <p className="text-xs text-slate-400">
                      Add as many rows as needed so each thickness has the correct maximum length and width recorded.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addThicknessDimension}
                    className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-300"
                  >
                    Add thickness
                  </button>
                </div>

                <div className="mt-4 space-y-4" aria-live="polite">
                  {formState.thicknessDimensions.length ? (
                    formState.thicknessDimensions.map((dimension, index) => {
                      const thicknessId = `thickness-${index}`;
                      const lengthId = `length-${index}`;
                      const widthId = `width-${index}`;
                      return (
                        <div
                          key={`${thicknessId}-${lengthId}-${widthId}`}
                          className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                        >
                          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-3">
                            <div>
                              <label className="text-sm font-semibold text-slate-100" htmlFor={thicknessId}>
                                Thickness (mm)
                              </label>
                              <input
                                id={thicknessId}
                                type="text"
                                list="thickness-suggestions"
                                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                                value={dimension.thickness}
                                onChange={event => updateThicknessDimension(index, 'thickness', event.target.value)}
                                placeholder="e.g. 16"
                                aria-describedby={`${thicknessId}-help`}
                              />
                              <p id={`${thicknessId}-help`} className="mt-1 text-[0.7rem] text-slate-400">
                                Type the stocked thickness so estimators know which board size applies.
                              </p>
                            </div>
                            <div>
                              <label className="text-sm font-semibold text-slate-100" htmlFor={lengthId}>
                                Maximum length
                              </label>
                              <input
                                id={lengthId}
                                type="text"
                                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                                value={dimension.maxLength}
                                onChange={event => updateThicknessDimension(index, 'maxLength', event.target.value)}
                                placeholder="e.g. 3600mm"
                                aria-describedby={`${lengthId}-help`}
                              />
                              <p id={`${lengthId}-help`} className="mt-1 text-[0.7rem] text-slate-400">
                                Share the longest blank available for this thickness so drafters can plan joins.
                              </p>
                            </div>
                            <div>
                              <label className="text-sm font-semibold text-slate-100" htmlFor={widthId}>
                                Maximum width
                              </label>
                              <input
                                id={widthId}
                                type="text"
                                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                                value={dimension.maxWidth}
                                onChange={event => updateThicknessDimension(index, 'maxWidth', event.target.value)}
                                placeholder="e.g. 1500mm"
                                aria-describedby={`${widthId}-help`}
                              />
                              <p id={`${widthId}-help`} className="mt-1 text-[0.7rem] text-slate-400">
                                Record the widest sheet stocked in this thickness so wide tops are quoted correctly.
                              </p>
                            </div>
                            <div className="sm:text-right">
                              <button
                                type="button"
                                onClick={() => removeThicknessDimension(index)}
                                className="mt-6 text-xs text-rose-300 hover:text-rose-200"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-4 py-6 text-center text-sm text-slate-400">
                      No thickness rows yet. Add one so the colour saves with accurate sheet sizes.
                    </p>
                  )}
                </div>

                <datalist id="thickness-suggestions">
                  {thicknessOptions.map(option => (
                    <option value={option} key={option} />
                  ))}
                </datalist>
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
