import { useEffect, useMemo, useState } from 'react';
import Configurator3D, {
  TableShape,
  TabletopConfig
} from './Configurator3D';
import { usePricing } from './usePricing';
import CustomShapeUpload from './CustomShapeUpload';
import { CustomShapeDetails } from './customShapeTypes';

const defaultConfig: TabletopConfig = {
  shape: 'rounded-rect',
  lengthMm: 2000,
  widthMm: 900,
  thicknessMm: 25,
  edgeRadiusMm: 150,
  superEllipseExponent: 2.5,
  material: 'laminate',
  finish: 'matte',
  quantity: 1
};

// Supported board thickness increments for the slider.
const thicknessOptions = [12, 16, 18, 25, 33];

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

const ConfiguratorPage: React.FC = () => {
  const [config, setConfig] = useState<TabletopConfig>(defaultConfig);
  // Custom shape metadata drives the DXF preview + the locked dimensions.
  const [customShape, setCustomShape] = useState<CustomShapeDetails | null>(null);
  const { price, loading, error } = usePricing(config);

  const updateField = (field: keyof TabletopConfig, value: number | string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleShapeChange = (shape: TableShape) => {
    setConfig(prev => ({ ...prev, shape }));
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

  const maxCornerRadius = useMemo(() => Math.floor(config.widthMm / 2), [config.widthMm]);
  // Translate the saved thickness back to the slider position.
  const thicknessIndex = useMemo(
    () => Math.max(thicknessOptions.indexOf(config.thicknessMm), 0),
    [config.thicknessMm]
  );

  const dimensionLocked = config.shape === 'custom';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Configure your tabletop</h1>
        <p className="text-sm text-slate-300">
          Adjust dimensions, shape and material to match your project. The 3D
          preview updates in real time.
        </p>
        <div className="relative h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <Configurator3D config={config} customOutline={customShape?.outline ?? null} />
          {config.shape === 'custom' && !customShape?.outline && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/70 px-6 text-center text-sm text-slate-200">
              Upload a DXF file to see the custom outline in the preview window.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Parameters</h2>
        <div className="grid gap-3 text-xs text-slate-200">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shapeOptions.map(option => (
              <button
                key={option.shape}
                onClick={() => handleShapeChange(option.shape)}
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

          {config.shape === 'custom' && (
            <CustomShapeUpload
              value={customShape}
              onChange={details => setCustomShape(details)}
              onDimensions={handleCustomDimensions}
            />
          )}

          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.75rem] font-medium">
              <span>Length (mm)</span>
              <span className="text-slate-400">{config.lengthMm} mm</span>
            </div>
            <input
              type="range"
              min={500}
              max={3600}
              step={10}
              value={config.lengthMm}
              onChange={e => updateField('lengthMm', Number(e.target.value))}
              className={`accent-emerald-400 ${dimensionLocked ? 'cursor-not-allowed opacity-50' : ''}`}
              disabled={dimensionLocked}
            />
            <p className="text-[0.7rem] text-slate-400">
              Slide between 500&nbsp;mm and 3600&nbsp;mm to match your room or base footprint.
            </p>
            {dimensionLocked && (
              <p className="text-[0.7rem] text-amber-300">
                Length follows the bounding box of the uploaded DXF. Update your CAD file to adjust.
              </p>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.75rem] font-medium">
              <span>Width (mm)</span>
              <span className="text-slate-400">{config.widthMm} mm</span>
            </div>
            <input
              type="range"
              min={300}
              max={1800}
              step={10}
              value={config.widthMm}
              onChange={e => updateField('widthMm', Number(e.target.value))}
              className={`accent-emerald-400 ${dimensionLocked ? 'cursor-not-allowed opacity-50' : ''}`}
              disabled={dimensionLocked}
            />
            <p className="text-[0.7rem] text-slate-400">
              Choose a width from 300&nbsp;mm to 1800&nbsp;mm—ideal for narrow desks or
              generous conference tables.
            </p>
            {dimensionLocked && (
              <p className="text-[0.7rem] text-amber-300">
                Width is locked to your DXF outline so the preview and pricing stay accurate.
              </p>
            )}
          </label>

          {config.shape === 'rounded-rect' && (
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[0.75rem] font-medium">
                <span>Corner radius (mm)</span>
                <span className="text-slate-400">{config.edgeRadiusMm} mm</span>
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
              <p className="text-[0.7rem] text-slate-400">
                Pick between a gentle 50&nbsp;mm curve and up to half of the table width for a
                bold rounded corner.
              </p>
            </label>
          )}

          {config.shape === 'super-ellipse' && (
            <label className="flex flex-col gap-1">
              {/* Allow designers to blend between a pure ellipse and a squarer super ellipse. */}
              <div className="flex items-center justify-between text-[0.75rem] font-medium">
                <span>Softness exponent</span>
                <span className="text-slate-400">
                  n = {config.superEllipseExponent.toFixed(1)}
                </span>
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
                Increase the exponent to morph the curve from a soft ellipse (n≈2) to a
                squarer super-ellipse that keeps wider straights before sweeping into the
                ends.
              </p>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.75rem] font-medium">
              <span>Thickness (mm)</span>
              <span className="text-slate-400">{config.thicknessMm} mm</span>
            </div>
            <input
              type="range"
              min={0}
              max={thicknessOptions.length - 1}
              step={1}
              value={thicknessIndex}
              onChange={e => {
                const nextIndex = Number(e.target.value);
                updateField('thicknessMm', thicknessOptions[nextIndex]);
              }}
              className="accent-emerald-400"
            />
            <p className="text-[0.7rem] text-slate-400">
              Snap to common board sizes: 12, 16, 18, 25 or 33&nbsp;mm thicknesses.
            </p>
          </label>

          <label className="flex flex-col gap-1">
            <span>Quantity</span>
            <input
              type="number"
              min={1}
              max={50}
              value={config.quantity}
              onChange={e => updateField('quantity', Number(e.target.value))}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
            <p className="text-[0.7rem] text-slate-400">
              Tell us how many identical tops you require (between 1 and 50) so pricing stays
              accurate.
            </p>
          </label>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-400">Estimated price</span>
            <span className="text-lg font-semibold">{formattedPrice}</span>
          </div>
          {loading && (
            <p className="text-xs text-slate-400">Recalculating price…</p>
          )}
          {error && (
            <p className="text-xs text-red-400">Pricing error: {error}</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default ConfiguratorPage;
