import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@auth/AuthContext';
import { db } from '@auth/firebase';
import Configurator3D, {
  TableShape,
  TabletopConfig
} from './Configurator3D';
import { usePricing } from './usePricing';
import CustomShapeUpload from './CustomShapeUpload';
import { CustomShapeDetails } from './customShapeTypes';
import { defaultTabletopConfig } from './defaultConfig';
import { buildCartSearchKeywords } from '../cart/cartUtils';
import ViewportMouseGuide from './ViewportMouseGuide';

const ROUND_DIAMETER_LIMIT_MM = 1800;

// Supported board thickness increments for the slider.
const DEFAULT_THICKNESS_OPTIONS = [12, 16, 18, 25, 33];

interface ThicknessDimension {
  thickness: string;
  maxLength: string;
  maxWidth: string;
}

interface CatalogueMaterial {
  id: string;
  name: string;
  materialType: string;
  finish: string;
  supplierSku: string;
  hexCode?: string;
  imageUrl?: string;
  isPopular: boolean;
  maxLength: string;
  maxWidth: string;
  availableThicknesses: string[];
  thicknessDimensions: ThicknessDimension[];
}

// Convert stored catalogue measurements (e.g. "3600mm" or "3.6m")
// into a number of millimetres for enforcing limits.
const parseMeasurementToMm = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  const numericPortion = trimmed.replace(/[^0-9.]/g, '');
  if (!numericPortion) return null;
  const parsed = Number(numericPortion);
  if (Number.isNaN(parsed)) return null;

  // Treat values <= 10 as metres so "3.6" can stand for 3.6m -> 3600mm.
  if (parsed > 10) {
    return Math.round(parsed);
  }
  return Math.round(parsed * 1000);
};

const parseThicknessToNumber = (value?: string | number | null): number | null => {
  if (value == null) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  const numericPortion = trimmed.replace(/[^0-9.]/g, '');
  if (!numericPortion) return null;
  const parsed = Number(numericPortion);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed);
};

const materialTypeToConfigMaterial = (
  materialType?: string
): TabletopConfig['material'] => {
  const normalized = (materialType ?? '').toLowerCase();
  if (normalized.includes('linoleum')) return 'linoleum';
  if (normalized.includes('veneer') || normalized.includes('timber')) return 'timber';
  return 'laminate';
};

// Simple utility for clamping manual numeric input so values never exceed the
// existing slider limits.
const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Edge styles that shop floor teams can filter against in the search UI.
const edgeProfileOptions: {
  value: TabletopConfig['edgeProfile'];
  label: string;
  description: string;
  searchHint: string;
  preview: JSX.Element;
}[] = [
  {
    value: 'edged',
    label: 'Square ABS edge',
    description: 'Standard straight edge banding for fast production and resilient school/workplace installs.',
    searchHint: 'Search for “edged ABS” to filter quotes.',
    preview: (
      // Stylised square edge that highlights the ABS band being applied.
      <svg
        viewBox="0 0 160 90"
        className="h-20 w-full text-emerald-300"
        role="img"
        aria-label="Cross-section of a square ABS edge band"
      >
        <defs>
          <linearGradient id="absEdge" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d1fae5" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <rect x="15" y="25" width="130" height="45" fill="#0f172a" stroke="#34d399" strokeWidth={3} rx={4} />
        <rect x="118" y="25" width="27" height="45" fill="url(#absEdge)" stroke="#34d399" strokeWidth={3} />
        <text x="95" y="20" className="fill-emerald-200 text-[10px]" textAnchor="middle">
          ABS band
        </text>
      </svg>
    )
  },
  {
    value: 'painted-sharknose',
    label: 'Painted sharknose',
    description: 'Hand-finished underside bevel that hides the board thickness and delivers a premium floating look.',
    searchHint: 'Search using “sharknose paint” when chasing this finish.',
    preview: (
      // Underside bevel illustration emphasising the painted sharknose reveal.
      <svg
        viewBox="0 0 160 90"
        className="h-20 w-full text-emerald-300"
        role="img"
        aria-label="Cross-section of a painted sharknose edge"
      >
        <defs>
          <linearGradient id="sharknosePaint" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f472b6" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#ec4899" stopOpacity={0.5} />
          </linearGradient>
          <linearGradient id="sharknoseReveal" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#a5b4fc" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <path
          d="M20 25 H140 V33 L103 70 H20 Z"
          fill="#0f172a"
          stroke="#34d399"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {/* Highlight the 8mm straight reveal before the 45° underside taper. */}
        <rect x="134" y="25" width="12" height="8" fill="url(#sharknoseReveal)" rx={2} />
        <path d="M140 33 L103 70" stroke="url(#sharknosePaint)" strokeWidth={5} strokeLinecap="round" />
        <text x="115" y="20" className="fill-emerald-200 text-[10px]" textAnchor="middle">
          Hand-painted bevel
        </text>
      </svg>
    )
  }
];

// Visual previews for each tabletop shape help replace the plain text buttons and
// keep the UI consistent with the request for image-based selectors.
const shapeOptions: { shape: TableShape; label: string; icon: JSX.Element }[] = [
  {
    shape: 'rect',
    label: 'Rectangle',
    icon: (
      <div
        aria-hidden
        className="h-10 w-16 rounded-sm border-2 border-emerald-300/50 bg-emerald-400/20"
      />
    )
  },
  {
    shape: 'rounded-rect',
    label: 'Rounded corners',
    icon: (
      <div
        aria-hidden
        className="h-10 w-16 rounded-2xl border-2 border-emerald-300/50 bg-emerald-400/20"
      />
    )
  },
  {
    shape: 'round-top',
    label: 'D End Top',
    icon: (
      <svg
        aria-hidden
        viewBox="0 0 100 60"
        className="h-10 w-16 text-emerald-300"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
      >
        {/* Visualize the D-shaped profile. */}
        <path
          d="M20 10 H55 A20 20 0 0 1 55 50 H20 Z"
          className="fill-emerald-400/20 stroke-emerald-300"
        />
      </svg>
    )
  },
  {
    shape: 'round',
    label: 'Round',
    icon: (
      <div
        aria-hidden
        className="flex h-10 w-16 items-center justify-center"
      >
        <div className="h-12 w-12 rounded-full border-2 border-emerald-300/50 bg-emerald-400/20" />
      </div>
    )
  },
  {
    shape: 'ellipse',
    label: 'Ellipse',
    icon: (
      <div
        aria-hidden
        className="h-10 w-16 rounded-full border-2 border-emerald-300/50 bg-emerald-400/20"
      />
    )
  },
  {
    shape: 'super-ellipse',
    label: 'Super ellipse',
    icon: (
      <svg
        aria-hidden
        viewBox="0 0 100 60"
        className="h-10 w-16 text-emerald-300"
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
      >
        <path d="M20 10 C10 10 10 50 20 50 H80 C90 50 90 10 80 10 Z" className="fill-emerald-400/20" />
      </svg>
    )
  },
  {
    shape: 'custom',
    label: 'Custom DXF/DWG',
    icon: (
      <div aria-hidden className="flex h-10 w-16 items-center justify-center rounded border-2 border-emerald-300/50">
        <svg
          viewBox="0 0 48 48"
          className="h-6 w-6 text-emerald-300"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            d="M8 24h8l4-8 8 16 4-8h8"
            className="stroke-emerald-300"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    )
  }
];

// Numeric fields that expose both a slider and manual entry.
type NumericConfigField =
  | 'lengthMm'
  | 'widthMm'
  | 'edgeRadiusMm'
  | 'superEllipseExponent'
  | 'thicknessMm';

const ConfiguratorPage: React.FC = () => {
  const [config, setConfig] = useState<TabletopConfig>(defaultTabletopConfig);
  // Mirror the manual inputs as strings so makers can type freely before we
  // clamp and sync the values back to the sliders.
  const [manualInputs, setManualInputs] = useState<Record<NumericConfigField, string>>({
    lengthMm: defaultTabletopConfig.lengthMm.toString(),
    widthMm: defaultTabletopConfig.widthMm.toString(),
    edgeRadiusMm: defaultTabletopConfig.edgeRadiusMm.toString(),
    superEllipseExponent: defaultTabletopConfig.superEllipseExponent.toString(),
    thicknessMm: defaultTabletopConfig.thicknessMm.toString()
  });
  // Custom shape metadata drives the DXF preview + the locked dimensions.
  const [customShape, setCustomShape] = useState<CustomShapeDetails | null>(null);
  const { price, loading, error } = usePricing(config);
  const { profile } = useAuth();
  // Track whether the viewport is wide enough to expose the desktop sidebar so we
  // know when to portal the parameter controls into the left menu area.
  const [isDesktopSidebar, setIsDesktopSidebar] = useState(false);
  const [sidebarContainer, setSidebarContainer] = useState<HTMLElement | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<
    | { type: 'success'; message: string }
    | { type: 'error'; message: string }
    | null
  >(null);
  const [catalogueMaterials, setCatalogueMaterials] = useState<CatalogueMaterial[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [selectedCatalogueMaterialId, setSelectedCatalogueMaterialId] = useState<string | null>(null);
  // Keep the tabletop shape picker compact until the user intentionally hovers/taps to expand it.
  const [isShapeTrayExpanded, setIsShapeTrayExpanded] = useState(false);
  const selectedShapeOption = useMemo(
    () => shapeOptions.find(option => option.shape === config.shape),
    [config.shape]
  );

  // Keep the manual string inputs aligned whenever a slider or preset updates
  // the underlying config so the two controls never drift apart.
  useEffect(() => {
    setManualInputs(prev => ({ ...prev, lengthMm: config.lengthMm.toString() }));
  }, [config.lengthMm]);

  useEffect(() => {
    setManualInputs(prev => ({ ...prev, widthMm: config.widthMm.toString() }));
  }, [config.widthMm]);

  useEffect(() => {
    setManualInputs(prev => ({ ...prev, edgeRadiusMm: config.edgeRadiusMm.toString() }));
  }, [config.edgeRadiusMm]);

  useEffect(() => {
    setManualInputs(prev => ({ ...prev, superEllipseExponent: config.superEllipseExponent.toString() }));
  }, [config.superEllipseExponent]);

  useEffect(() => {
    setManualInputs(prev => ({ ...prev, thicknessMm: config.thicknessMm.toString() }));
  }, [config.thicknessMm]);

  useEffect(() => {
    const materialsQuery = query(collection(db, 'materials'), orderBy('name'));
    const unsubscribe = onSnapshot(
      materialsQuery,
      snapshot => {
        const nextMaterials: CatalogueMaterial[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Partial<CatalogueMaterial> & {
            thicknessDimensions?: ThicknessDimension[];
          };
          const normalizedDimensions = Array.isArray(data.thicknessDimensions)
            ? data.thicknessDimensions
                .map(dimension => ({
                  thickness: dimension.thickness ?? '',
                  maxLength: dimension.maxLength ?? '',
                  maxWidth: dimension.maxWidth ?? ''
                }))
                .filter(
                  dimension => dimension.thickness || dimension.maxLength || dimension.maxWidth
                )
            : [];
          const derivedThicknesses = normalizedDimensions
            .map(dimension => dimension.thickness)
            .filter((entry): entry is string => Boolean(entry));
          return {
            id: docSnap.id,
            name: data.name ?? 'Untitled colour',
            materialType: data.materialType ?? '',
            finish: data.finish ?? '',
            supplierSku: data.supplierSku ?? '',
            hexCode: data.hexCode,
            imageUrl: data.imageUrl,
            isPopular: Boolean(data.isPopular),
            maxLength: data.maxLength ?? '',
            maxWidth: data.maxWidth ?? '',
            availableThicknesses: derivedThicknesses.length
              ? derivedThicknesses
              : data.availableThicknesses ?? [],
            thicknessDimensions: normalizedDimensions
          };
        });
        setCatalogueMaterials(nextMaterials);
        setCatalogueLoading(false);
      },
      error => {
        console.error('Failed to load colour catalogue', error);
        setCatalogueLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const selectedCatalogueMaterial = useMemo(() => {
    if (!selectedCatalogueMaterialId) return null;
    return (
      catalogueMaterials.find(material => material.id === selectedCatalogueMaterialId) ?? null
    );
  }, [catalogueMaterials, selectedCatalogueMaterialId]);

  const filteredCatalogueMaterials = useMemo(() => {
    const searchValue = catalogueSearch.trim().toLowerCase();
    if (!searchValue) {
      return catalogueMaterials.slice(0, 5);
    }

    return catalogueMaterials
      .filter(material => {
        const haystack = [
          material.name,
          material.materialType,
          material.finish,
          material.supplierSku,
          material.isPopular ? 'popular favourite top pick' : ''
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchValue);
      })
      .slice(0, 5);
  }, [catalogueMaterials, catalogueSearch]);

  const thicknessChoices = useMemo(() => {
    const parsedFromDimensions = selectedCatalogueMaterial?.thicknessDimensions?.length
      ? selectedCatalogueMaterial.thicknessDimensions
          .map(dimension => parseThicknessToNumber(dimension.thickness))
          .filter((value): value is number => value != null)
      : [];

    if (parsedFromDimensions.length) {
      return Array.from(new Set(parsedFromDimensions)).sort((a, b) => a - b);
    }

    if (!selectedCatalogueMaterial?.availableThicknesses?.length) {
      return DEFAULT_THICKNESS_OPTIONS;
    }
    const parsed = selectedCatalogueMaterial.availableThicknesses
      .map(entry => Number(entry.toString().replace(/[^0-9.]/g, '')))
      .filter(value => !Number.isNaN(value))
      .map(value => Math.round(value));
    const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
    return unique.length ? unique : DEFAULT_THICKNESS_OPTIONS;
  }, [selectedCatalogueMaterial]);

  const activeThicknessDimensions = useMemo(() => {
    if (!selectedCatalogueMaterial?.thicknessDimensions?.length) return null;
    const enrichedDimensions = selectedCatalogueMaterial.thicknessDimensions.map(dimension => ({
      ...dimension,
      numericThickness: parseThicknessToNumber(dimension.thickness)
    }));
    const exactMatch = enrichedDimensions.find(
      dimension => dimension.numericThickness === config.thicknessMm
    );
    if (exactMatch) return exactMatch;
    const fallback = enrichedDimensions.find(dimension => dimension.numericThickness != null);
    return fallback ?? enrichedDimensions[0];
  }, [config.thicknessMm, selectedCatalogueMaterial]);

  const snapToNearestThickness = useCallback(
    (value: number) =>
      thicknessChoices.reduce(
        (closest, option) =>
          Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
        thicknessChoices[0]
      ),
    [thicknessChoices]
  );

  const updateField = (field: keyof TabletopConfig, value: number | string) => {
    setConfig(prev => {
      // Keep circular tops perfectly round by mirroring the length/width values.
      if (prev.shape === 'round' && (field === 'lengthMm' || field === 'widthMm')) {
        const numericValue = typeof value === 'number' ? value : Number(value);
        return {
          ...prev,
          lengthMm: numericValue,
          widthMm: numericValue
        };
      }

      return { ...prev, [field]: value };
    });
  };

  useEffect(() => {
    setConfig(prev => {
      const snapped = snapToNearestThickness(prev.thicknessMm);
      if (snapped === prev.thicknessMm) return prev;
      return { ...prev, thicknessMm: snapped };
    });
  }, [snapToNearestThickness]);

  // Allow designers to type in exact measurements without fighting the slider
  // by keeping the raw string in state until we have a valid number.
  const handleManualNumberChange = (
    field: NumericConfigField,
    min: number,
    max: number,
    snapToOption?: (value: number) => number
  ) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setManualInputs(prev => ({ ...prev, [field]: value }));

    if (value.trim() === '') {
      // Let makers clear the field before entering a new size without forcing
      // the previous number back in.
      return;
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return;

    const clampedValue = clampNumber(numericValue, min, max);
    const normalizedValue = snapToOption ? snapToOption(clampedValue) : clampedValue;

    updateField(field, normalizedValue);
  };

  // When the input loses focus make sure we clamp/snaps the typed value so the
  // slider and preview are always in sync.
  const handleManualNumberBlur = (
    field: NumericConfigField,
    min: number,
    max: number,
    snapToOption?: (value: number) => number
  ) => () => {
    setManualInputs(prev => {
      const rawValue = prev[field];
      const numericValue = Number(rawValue);
      const fallbackValue = Number.isNaN(numericValue) ? config[field] : numericValue;
      const clampedValue = clampNumber(fallbackValue, min, max);
      const normalizedValue = snapToOption ? snapToOption(clampedValue) : clampedValue;

      updateField(field, normalizedValue);

      return {
        ...prev,
        [field]: normalizedValue.toString()
      };
    });
  };

  const handleShapeChange = (shape: TableShape) => {
    setConfig(prev => {
      if (shape === 'round') {
        // Keep the diameter within the 1800 mm manufacturing constraint and
        // reuse the smallest dimension as the starting point so we don't grow
        // the design unexpectedly when switching shapes.
        const targetDiameter = Math.min(
          ROUND_DIAMETER_LIMIT_MM,
          Math.max(500, Math.min(prev.lengthMm, prev.widthMm))
        );

        return {
          ...prev,
          shape,
          lengthMm: targetDiameter,
          widthMm: targetDiameter
        };
      }

      return { ...prev, shape };
    });
  };

  // Collapse the hover tray as soon as the maker commits to a different outline.
  const handleShapeSelect = (shape: TableShape) => {
    handleShapeChange(shape);
    setIsShapeTrayExpanded(false);
  };

  // Whenever we parse a DXF we push the detected bounding box into the sliders so
  // pricing still has sensible numbers to work with.
  const handleCustomDimensions = (
    dimensions: { lengthMm: number; widthMm: number } | null
  ) => {
    if (!dimensions) return;
    setConfig(prev => ({
      ...prev,
      lengthMm: Math.round(dimensions.lengthMm),
      widthMm: Math.round(dimensions.widthMm)
    }));
  };

  const handleCatalogueSelection = (material: CatalogueMaterial) => {
    setSelectedCatalogueMaterialId(material.id);
    setCatalogueSearch(material.name);
    setConfig(prev => {
      const mappedMaterial = materialTypeToConfigMaterial(material.materialType);
      const finishLabel = (material.finish || '').toLowerCase();
      let nextFinish = prev.finish;
      if (finishLabel.includes('matte')) nextFinish = 'matte';
      if (finishLabel.includes('satin') || finishLabel.includes('semi') || finishLabel.includes('gloss')) {
        nextFinish = 'satin';
      }
      if (mappedMaterial === prev.material && nextFinish === prev.finish) {
        return prev;
      }
      return { ...prev, material: mappedMaterial, finish: nextFinish };
    });
  };

  const formattedPrice =
    price != null
      ? price.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
      : '—';

  // Clamp the corner radius whenever the width slider reduces the available space.
  useEffect(() => {
    if (config.shape !== 'rounded-rect') return;
    const maxCornerRadius = Math.floor(config.widthMm / 2);
    if (config.edgeRadiusMm > maxCornerRadius) {
      setConfig(prev => ({
        ...prev,
        edgeRadiusMm: Math.max(50, maxCornerRadius)
      }));
    }
  }, [config.shape, config.widthMm, config.edgeRadiusMm]);

  const materialMaxLength = useMemo(
    () =>
      parseMeasurementToMm(
        activeThicknessDimensions?.maxLength ?? selectedCatalogueMaterial?.maxLength
      ),
    [activeThicknessDimensions, selectedCatalogueMaterial]
  );
  const materialMaxWidth = useMemo(
    () =>
      parseMeasurementToMm(
        activeThicknessDimensions?.maxWidth ?? selectedCatalogueMaterial?.maxWidth
      ),
    [activeThicknessDimensions, selectedCatalogueMaterial]
  );
  const baseLengthLimit = config.shape === 'round' ? ROUND_DIAMETER_LIMIT_MM : 3600;
  const rawLengthLimit = materialMaxLength ? Math.min(baseLengthLimit, materialMaxLength) : baseLengthLimit;
  const effectiveLengthLimit = Math.max(500, rawLengthLimit);
  const rawWidthLimit =
    config.shape === 'round'
      ? rawLengthLimit
      : materialMaxWidth
      ? Math.min(1800, materialMaxWidth)
      : 1800;
  const effectiveWidthLimit = Math.max(300, rawWidthLimit);
  const maxCornerRadius = useMemo(() => Math.floor(config.widthMm / 2), [config.widthMm]);
  // Translate the saved thickness back to the slider position.
  const thicknessIndex = useMemo(
    () => Math.max(thicknessChoices.indexOf(config.thicknessMm), 0),
    [config.thicknessMm, thicknessChoices]
  );
  const minThickness = thicknessChoices[0];
  const maxThickness = thicknessChoices[thicknessChoices.length - 1];
  const activeThicknessLabel = activeThicknessDimensions?.thickness?.trim();
  const catalogueMaxLengthLabel =
    activeThicknessDimensions?.maxLength || selectedCatalogueMaterial?.maxLength;
  const catalogueMaxWidthLabel =
    activeThicknessDimensions?.maxWidth || selectedCatalogueMaterial?.maxWidth;

  const dimensionLocked = config.shape === 'custom';
  const limitedByCatalogueLength = Boolean(
    selectedCatalogueMaterial && materialMaxLength && materialMaxLength < baseLengthLimit
  );
  const limitedByCatalogueWidth = Boolean(
    selectedCatalogueMaterial && materialMaxWidth && materialMaxWidth < 1800
  );
  const cartSurfaceLabel =
    selectedCatalogueMaterial?.name || selectedCatalogueMaterial?.materialType || 'Surface';
  const cartItemLabel = `${cartSurfaceLabel} ${config.shape} ${config.lengthMm}x${config.widthMm}mm top`;
  const extraSurfaceKeywords = useMemo(() => {
    if (!selectedCatalogueMaterial) return [] as string[];
    return [
      selectedCatalogueMaterial.name,
      selectedCatalogueMaterial.materialType,
      selectedCatalogueMaterial.finish,
      selectedCatalogueMaterial.supplierSku
    ]
      .filter((term): term is string => Boolean(term))
      .map(term => term.toString());
  }, [selectedCatalogueMaterial]);

  useEffect(() => {
    if (dimensionLocked) return;
    setConfig(prev => {
      if (prev.lengthMm <= effectiveLengthLimit) return prev;
      const nextLength = effectiveLengthLimit;
      if (prev.shape === 'round') {
        return { ...prev, lengthMm: nextLength, widthMm: nextLength };
      }
      return { ...prev, lengthMm: nextLength };
    });
  }, [dimensionLocked, effectiveLengthLimit]);

  useEffect(() => {
    if (dimensionLocked) return;
    setConfig(prev => {
      if (prev.widthMm <= effectiveWidthLimit) return prev;
      const clampedWidth = effectiveWidthLimit;
      if (prev.shape === 'round') {
        const synchronized = Math.min(clampedWidth, effectiveLengthLimit);
        return { ...prev, widthMm: synchronized, lengthMm: synchronized };
      }
      return { ...prev, widthMm: clampedWidth };
    });
  }, [dimensionLocked, effectiveWidthLimit, effectiveLengthLimit]);

  // Persist the current configuration to Firestore so customers can reference it later.
  const handleAddToCart = async () => {
    if (!profile) {
      setCartFeedback({
        type: 'error',
        message: 'Sign in so we can store this configuration in your cart.'
      });
      return;
    }

    setAddingToCart(true);
    setCartFeedback(null);
    try {
      const cartCollection = collection(db, 'cartItems');
      const customShapeMeta = customShape
        ? {
            fileName: customShape.fileName,
            fileSize: customShape.fileSize,
            fileType: customShape.fileType,
            notes: customShape.notes ?? null
          }
        : null;
      const selectedColourMeta = selectedCatalogueMaterial
        ? {
            id: selectedCatalogueMaterial.id,
            name: selectedCatalogueMaterial.name,
            materialType: selectedCatalogueMaterial.materialType,
            finish: selectedCatalogueMaterial.finish,
            supplierSku: selectedCatalogueMaterial.supplierSku,
            hexCode: selectedCatalogueMaterial.hexCode ?? null,
            imageUrl: selectedCatalogueMaterial.imageUrl ?? null,
            maxLength: selectedCatalogueMaterial.maxLength,
            maxWidth: selectedCatalogueMaterial.maxWidth,
            availableThicknesses: selectedCatalogueMaterial.availableThicknesses
          }
        : null;
      await addDoc(cartCollection, {
        userId: profile.id,
        label: cartItemLabel,
        config,
        customShape: customShapeMeta,
        selectedColour: selectedColourMeta,
        estimatedPrice: price ?? null,
        searchKeywords: buildCartSearchKeywords(
          config,
          cartSurfaceLabel,
          customShape,
          cartItemLabel,
          extraSurfaceKeywords
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setCartFeedback({
        type: 'success',
        message: 'Top added to your cart. Use the global search to find it by size, material or file name.'
      });
    } catch (err) {
      console.error('Failed to add cart item', err);
      setCartFeedback({
        type: 'error',
        message: 'We could not save this configuration. Please try again after checking your connection.'
      });
    } finally {
      setAddingToCart(false);
    }
  };

  // Keep the cart quantity as a clean integer within a sensible range so pricing,
  // search keywords and saved cart items always reflect what the customer expects.
  const handleQuantityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value.trim();
    const parsedValue = Number(rawValue);
    if (rawValue === '' || Number.isNaN(parsedValue)) {
      updateField('quantity', 1);
      return;
    }

    const clampedQuantity = clampNumber(Math.round(parsedValue), 1, 99);
    updateField('quantity', clampedQuantity);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDesktopSidebar(event.matches);

    setIsDesktopSidebar(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDesktopSidebar) {
      setSidebarContainer(null);
      return;
    }

    const container = document.getElementById('configurator-sidebar');
    setSidebarContainer(container);
  }, [isDesktopSidebar]);

  const parametersPanel = (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-200">Parameters</h2>
      <div className="grid gap-3 text-xs text-slate-200">
        <div
          className="rounded-xl border border-slate-800 bg-slate-950/70"
          onMouseEnter={() => setIsShapeTrayExpanded(true)}
          onMouseLeave={() => setIsShapeTrayExpanded(false)}
          onFocus={() => setIsShapeTrayExpanded(true)}
          onBlur={event => {
            // Collapse when the focus leaves the shape controls entirely.
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsShapeTrayExpanded(false);
            }
          }}
        >
          <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-[0.8rem] font-semibold text-slate-100">Tabletop Style</p>
            </div>
            <button
              type="button"
              aria-expanded={isShapeTrayExpanded}
              onClick={() => setIsShapeTrayExpanded(prev => !prev)}
              className={`self-start rounded-lg border px-3 py-1 text-[0.75rem] font-semibold transition sm:self-auto ${
                isShapeTrayExpanded
                  ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-200'
                  : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-emerald-300'
              }`}
            >
              {isShapeTrayExpanded ? 'Hide shapes' : 'Show shapes'}
            </button>
          </div>

          <div
            className={`overflow-hidden px-3 pb-3 transition-[max-height,opacity] duration-300 ${
              isShapeTrayExpanded ? 'max-h-[520px] opacity-100' : 'max-h-28 opacity-95'
            }`}
          >
            {isShapeTrayExpanded ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {shapeOptions.map(option => (
                  <button
                    key={option.shape}
                    onClick={() => handleShapeSelect(option.shape)}
                    className={`group relative flex h-20 items-center justify-center rounded-xl border bg-slate-950/70 transition ${
                      config.shape === option.shape
                        ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        : 'border-slate-700 hover:border-emerald-300/80'
                    }`}
                  >
                    {/* Icon previews make it easier to understand each table type at a glance. */}
                    {option.icon}
                    {/* Screen reader label + hover label */}
                    <span className="sr-only">{option.label}</span>
                    <span className="pointer-events-none absolute -bottom-7 rounded bg-slate-900 px-2 py-0.5 text-[0.65rem] text-slate-100 opacity-0 transition group-hover:opacity-100">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-500/5">
                  {selectedShapeOption?.icon}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-100">
                    {selectedShapeOption?.label ?? 'Select a tabletop shape'}
                  </p>
                  <p className="text-[0.7rem] text-slate-400">
                    Hover over this row (or tap the toggle) to expand and choose a different outline.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Colour search surfaces live catalogue data so operators pick real-world blanks. */}
        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-[0.75rem] font-medium text-slate-200" htmlFor="catalogue-search">
            <span>Colour catalogue search</span>
            <input
              id="catalogue-search"
              type="text"
              value={catalogueSearch}
              onChange={event => {
                setCatalogueSearch(event.target.value);
                if (!event.target.value) {
                  setSelectedCatalogueMaterialId(null);
                }
              }}
              placeholder="Search saved colours, finishes or SKU codes…"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
            />
          </label>
          <p className="text-[0.65rem] text-slate-400">
            Enter the colour name, finish, supplier or SKU. Selecting a result locks the maximum blank size and the available
            thicknesses so you stay within catalogue limits.
          </p>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            {catalogueLoading ? (
              <p className="text-[0.7rem] text-slate-400">Loading colour catalogue…</p>
            ) : filteredCatalogueMaterials.length ? (
              <ul className="space-y-2" role="listbox" aria-label="Colour search results">
                {filteredCatalogueMaterials.map(material => {
                  const isActive = material.id === selectedCatalogueMaterialId;
                  return (
                    <li key={material.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => handleCatalogueSelection(material)}
                        className={`flex w-full flex-col rounded-lg border p-2 text-left transition ${
                          isActive
                            ? 'border-emerald-400 bg-emerald-400/5 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            : 'border-slate-800 hover:border-emerald-300/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{material.name}</span>
                          {material.isPopular && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-200">
                              Popular
                            </span>
                          )}
                        </div>
                        <span className="text-[0.7rem] text-slate-400">
                          {(material.materialType || 'Material type TBD') + ' • ' + (material.finish || 'Finish TBD')}
                        </span>
                        {material.supplierSku && (
                          <span className="text-[0.65rem] text-slate-500">Supplier SKU: {material.supplierSku}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[0.7rem] text-slate-400">
                No colours match that search. Try a different name, finish description or SKU.
              </p>
            )}
          </div>
          {selectedCatalogueMaterial && (
            <div className="space-y-2 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-[0.7rem] text-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-emerald-200">Selected colour</p>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-slate-100">{selectedCatalogueMaterial.name}</p>
                    {selectedCatalogueMaterial.isPopular && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-200">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300">
                    {(selectedCatalogueMaterial.materialType || 'Material type TBD') + ' • ' + (selectedCatalogueMaterial.finish || 'Finish TBD')}
                  </p>
                  {selectedCatalogueMaterial.supplierSku && (
                    <p className="text-[0.65rem] text-slate-400">Supplier SKU: {selectedCatalogueMaterial.supplierSku}</p>
                  )}
                </div>
                {selectedCatalogueMaterial.hexCode && (
                  <span
                    className="h-12 w-12 rounded-lg border border-white/10"
                    aria-label={`Swatch for ${selectedCatalogueMaterial.name}`}
                    style={{ backgroundColor: selectedCatalogueMaterial.hexCode }}
                  />
                )}
              </div>
              <div className="grid gap-3 text-slate-200 sm:grid-cols-3">
                <div>
                  <p className="text-[0.6rem] uppercase tracking-wide text-slate-400">Max blank length</p>
                  <p className="text-sm">{catalogueMaxLengthLabel || `${effectiveLengthLimit}mm`}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] uppercase tracking-wide text-slate-400">Max blank width</p>
                  <p className="text-sm">{catalogueMaxWidthLabel || `${effectiveWidthLimit}mm`}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] uppercase tracking-wide text-slate-400">Thicknesses stocked</p>
                  <p className="text-sm">{`${thicknessChoices.join(', ')} mm`}</p>
                </div>
              </div>
              {activeThicknessLabel && (
                <p className="text-[0.6rem] uppercase tracking-wide text-slate-400">
                  Limits shown for {activeThicknessLabel} stock.
                </p>
              )}
            </div>
          )}
        </div>

        {config.shape === 'custom' && (
          <CustomShapeUpload
            value={customShape}
            onChange={details => setCustomShape(details)}
            onDimensions={handleCustomDimensions}
          />
        )}

        <label className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3 text-[0.75rem] font-medium">
            <span>Length (mm)</span>
            <div className="flex flex-col items-end text-right">
              <input
                type="number"
                min={500}
                max={effectiveLengthLimit}
                step={10}
                value={manualInputs.lengthMm}
                onChange={handleManualNumberChange('lengthMm', 500, effectiveLengthLimit)}
                onBlur={handleManualNumberBlur('lengthMm', 500, effectiveLengthLimit)}
                className={`w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 focus:border-emerald-400 focus:outline-none ${
                  dimensionLocked ? 'cursor-not-allowed opacity-50' : ''
                }`}
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={dimensionLocked}
              />
              <p className="text-[0.6rem] font-normal text-slate-500">
                Type an exact length between 500&nbsp;mm and {effectiveLengthLimit}&nbsp;mm.
              </p>
            </div>
          </div>
          <input
            type="range"
            min={500}
            max={effectiveLengthLimit}
            step={10}
            value={config.lengthMm}
            onChange={e => updateField('lengthMm', Number(e.target.value))}
            className={`accent-emerald-400 ${dimensionLocked ? 'cursor-not-allowed opacity-50' : ''}`}
            disabled={dimensionLocked}
          />
          <p className="text-[0.7rem] text-slate-400">
            {config.shape === 'round'
              ? `Round tops are limited to ${effectiveLengthLimit} mm in diameter so they stay practical to machine and transport.`
              : `Slide between 500 mm and ${effectiveLengthLimit} mm.`}
          </p>
          {limitedByCatalogueLength && selectedCatalogueMaterial && (
            <p className="text-[0.65rem] text-emerald-300">
              {selectedCatalogueMaterial.name} blanks top out at {catalogueMaxLengthLabel || `${effectiveLengthLimit} mm`}.
            </p>
          )}
          {dimensionLocked && (
            <p className="text-[0.7rem] text-amber-300">
              Length follows the bounding box of the uploaded DXF. Update your CAD file to adjust.
            </p>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3 text-[0.75rem] font-medium">
            <span>Width (mm)</span>
            <div className="flex flex-col items-end text-right">
              <input
                type="number"
                min={300}
                max={effectiveWidthLimit}
                step={10}
                value={manualInputs.widthMm}
                onChange={handleManualNumberChange('widthMm', 300, effectiveWidthLimit)}
                onBlur={handleManualNumberBlur('widthMm', 300, effectiveWidthLimit)}
                className={`w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 focus:border-emerald-400 focus:outline-none ${
                  dimensionLocked ? 'cursor-not-allowed opacity-50' : ''
                }`}
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={dimensionLocked}
              />
              <p className="text-[0.6rem] font-normal text-slate-500">
                Enter a width between 300&nbsp;mm and {effectiveWidthLimit}&nbsp;mm.
              </p>
            </div>
          </div>
          <input
            type="range"
            min={300}
            max={effectiveWidthLimit}
            step={10}
            value={config.widthMm}
            onChange={e => updateField('widthMm', Number(e.target.value))}
            className={`accent-emerald-400 ${dimensionLocked ? 'cursor-not-allowed opacity-50' : ''}`}
            disabled={dimensionLocked}
          />
          <p className="text-[0.7rem] text-slate-400">
            {config.shape === 'round'
              ? 'Width mirrors the length so the new round top stays perfectly circular.'
              : `Choose a width from 300 mm to ${effectiveWidthLimit} mm.`}
          </p>
          {limitedByCatalogueWidth && selectedCatalogueMaterial && (
            <p className="text-[0.65rem] text-emerald-300">
              {selectedCatalogueMaterial.name} sheets max out at {catalogueMaxWidthLabel || `${effectiveWidthLimit} mm`}.
            </p>
          )}
          {dimensionLocked && (
            <p className="text-[0.7rem] text-amber-300">
              Width is locked to your DXF outline so the preview and pricing stay accurate.
            </p>
          )}
          {config.shape === 'round' && (
            <p className="text-[0.7rem] text-emerald-300">
              Adjust either slider to set the diameter—both measurements update together to keep a circle.
            </p>
          )}
        </label>

        {config.shape === 'rounded-rect' && (
          <label className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3 text-[0.75rem] font-medium">
              <span>Corner radius (mm)</span>
              <div className="flex flex-col items-end text-right">
                <input
                  type="number"
                  min={50}
                  max={maxCornerRadius}
                  step={5}
                  value={manualInputs.edgeRadiusMm}
                  onChange={handleManualNumberChange('edgeRadiusMm', 50, maxCornerRadius)}
                  onBlur={handleManualNumberBlur('edgeRadiusMm', 50, maxCornerRadius)}
                  className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <p className="text-[0.6rem] font-normal text-slate-500">
                  Enter a corner radius between 50&nbsp;mm and {maxCornerRadius}&nbsp;mm.
                </p>
              </div>
            </div>
            <input
              type="range"
              min={50}
              max={maxCornerRadius}
              step={5}
              value={config.edgeRadiusMm}
              onChange={e => updateField('edgeRadiusMm', Number(e.target.value))}
              className="accent-emerald-400"
            />
            <p className="text-[0.7rem] text-slate-400">Minimum 50&nbsp;mm up to half the table width.</p>
          </label>
        )}

        {config.shape === 'super-ellipse' && (
          <label className="flex flex-col gap-1">
            {/* Allow designers to blend between a pure ellipse and a squarer super ellipse. */}
            <div className="flex items-start justify-between gap-3 text-[0.75rem] font-medium">
              <span>Softness exponent</span>
              <div className="flex flex-col items-end text-right">
                <input
                  type="number"
                  min={1.5}
                  max={6}
                  step={0.1}
                  value={manualInputs.superEllipseExponent}
                  onChange={handleManualNumberChange('superEllipseExponent', 1.5, 6)}
                  onBlur={handleManualNumberBlur('superEllipseExponent', 1.5, 6)}
                  className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  inputMode="decimal"
                />
                <p className="text-[0.6rem] font-normal text-slate-500">
                  Type an exponent between 1.5 and 6 to fine tune the softness.
                </p>
              </div>
            </div>
            <input
              type="range"
              min={1.5}
              max={6}
              step={0.1}
              value={config.superEllipseExponent}
              onChange={e => updateField('superEllipseExponent', Number(e.target.value))}
              className="accent-emerald-400"
            />
            <p className="text-[0.7rem] text-slate-400">
              Increase the exponent to morph the curve from a soft ellipse (n≈2) to a squarer super-ellipse that keeps wider
              straights before sweeping into the ends.
            </p>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3 text-[0.75rem] font-medium">
            <span>Thickness (mm)</span>
            <div className="flex flex-col items-end text-right">
              <input
                type="number"
                min={minThickness}
                max={maxThickness}
                step={1}
                value={manualInputs.thicknessMm}
                onChange={handleManualNumberChange(
                  'thicknessMm',
                  minThickness,
                  maxThickness,
                  snapToNearestThickness
                )}
                onBlur={handleManualNumberBlur(
                  'thicknessMm',
                  minThickness,
                  maxThickness,
                  snapToNearestThickness
                )}
                className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <p className="text-[0.6rem] font-normal text-slate-500">
                Enter one of the stocked thicknesses ({thicknessChoices.join(', ')}&nbsp;mm).
              </p>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={thicknessChoices.length - 1}
            step={1}
            value={thicknessIndex}
            onChange={e => {
              const nextIndex = Number(e.target.value);
              updateField('thicknessMm', thicknessChoices[nextIndex]);
            }}
            className="accent-emerald-400"
          />
          <p className="text-[0.7rem] text-slate-400">
            Snap to the catalogue-supported thicknesses: {thicknessChoices.join(', ')}&nbsp;mm.
          </p>
        </label>

      </div>

    </section>
  );

  const edgeProfileSelector = (
    <div
      className="h-full rounded-2xl border border-slate-800 bg-slate-900 p-4"
      aria-labelledby="edge-profile-label"
      role="radiogroup"
    >
      <div className="flex items-center justify-between gap-4 text-[0.75rem] font-medium" id="edge-profile-label">
        <span className="text-slate-200">Edge profile</span>
        <span className="text-slate-400">
          {edgeProfileOptions.find(option => option.value === config.edgeProfile)?.label}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {edgeProfileOptions.map(option => {
          const isActive = option.value === config.edgeProfile;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateField('edgeProfile', option.value)}
              role="radio"
              aria-checked={isActive}
              className={`flex h-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                isActive
                  ? 'border-emerald-400 bg-emerald-400/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : 'border-slate-700 bg-slate-950/70 hover:border-emerald-300/80'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900/70 p-2">
                {/* Inline SVG previews give installers a quick visual cue for the profile. */}
                {option.preview}
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-semibold text-slate-100">{option.label}</p>
                <p className="text-[0.7rem] text-slate-400">Tap to apply this edge.</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    // Stretch the configurator to fill the viewport beneath the sticky header + nav so
    // the 3D preview can occupy as much space as possible without forcing the page to scroll.
    // The height is slightly reduced to give breathing room for the new action bar beneath the viewport.
    <div className="flex h-[calc(100dvh-260px)] flex-col space-y-6 overflow-hidden">
      <section className="flex flex-1 min-h-0 flex-col space-y-4">
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <Configurator3D
            config={config}
            customOutline={customShape?.outline ?? null}
            swatch={
              selectedCatalogueMaterial
                ? {
                    hexCode: selectedCatalogueMaterial.hexCode,
                    imageUrl: selectedCatalogueMaterial.imageUrl
                  }
                : null
            }
          />
          <ViewportMouseGuide />
          {config.shape === 'custom' && !customShape?.outline && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/70 px-6 text-center text-sm text-slate-200">
              Upload a DXF file to see the custom outline in the preview window.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
          {/* Surface edge profile controls beside pricing so the call-to-action stays aligned. */}
          <div className="flex-1">{edgeProfileSelector}</div>

          {/* Place the pricing + cart controls directly under the viewport so the call-to-action is always visible. */}
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:w-[420px] md:flex-none md:flex-row md:items-center md:justify-start md:gap-6">
            <div className="space-y-1 text-slate-200 md:w-1/2">
              <div className="flex items-baseline gap-2 text-xs text-slate-400">
                <span>Estimated price</span>
                {loading && <span className="text-[0.65rem] text-slate-400">Recalculating…</span>}
                {error && <span className="text-[0.65rem] text-red-300">Pricing error: {error}</span>}
              </div>
              <p className="text-xl font-semibold">{formattedPrice}</p>
            </div>
            {/* Keep the quantity input directly beside the call-to-action so buyers can set multiples before saving. */}
            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-1 md:flex-row-reverse md:items-start md:gap-4">
              {/* Surface the call-to-action first on desktop so the “Add to cart” button sits to the left of the quantity input. */}
              <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:flex-none md:items-start md:self-stretch">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={addingToCart || !profile}
                  className={`inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition md:w-auto ${
                    addingToCart || !profile
                      ? 'cursor-not-allowed bg-slate-800 text-slate-400'
                      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  }`}
                >
                  {addingToCart ? 'Saving top…' : 'Add to cart'}
                </button>
                {!profile && (
                  <p className="text-[0.7rem] text-amber-300">
                    You need to sign in before saving items to the cart. This keeps your configurations private.
                  </p>
                )}
                {cartFeedback && (
                  <p
                    role="status"
                    className={`text-[0.7rem] ${
                      cartFeedback.type === 'success' ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {cartFeedback.message}
                  </p>
                )}
              </div>
              <div className="flex w-full flex-col gap-1 md:w-52">
                <label htmlFor="cart-quantity" className="text-sm font-medium text-slate-200">
                  Quantity
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="cart-quantity"
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    value={config.quantity}
                    onChange={handleQuantityChange}
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <span className="text-xs text-slate-400">pcs</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* On smaller screens the sidebar is hidden, so keep an inline copy of the parameters. */}
      <div className="md:hidden">{parametersPanel}</div>
      {/* When the desktop sidebar is visible, mount the parameters inside it via a portal. */}
      {sidebarContainer && isDesktopSidebar && createPortal(parametersPanel, sidebarContainer)}
    </div>
  );
};

export default ConfiguratorPage;
