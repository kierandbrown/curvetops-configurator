import { useState } from 'react';
import Configurator3D, {
  TableShape,
  TabletopConfig
} from './Configurator3D';
import { usePricing } from './usePricing';

const defaultConfig: TabletopConfig = {
  shape: 'rounded-rect',
  lengthMm: 2000,
  widthMm: 900,
  thicknessMm: 25,
  edgeRadiusMm: 150,
  material: 'laminate',
  finish: 'matte',
  quantity: 1
};

const ConfiguratorPage: React.FC = () => {
  const [config, setConfig] = useState<TabletopConfig>(defaultConfig);
  const { price, loading, error } = usePricing(config);

  const updateField = (field: keyof TabletopConfig, value: number | string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleShapeChange = (shape: TableShape) => {
    setConfig(prev => ({ ...prev, shape }));
  };

  const formattedPrice =
    price != null
      ? price.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
      : '—';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Configure your tabletop</h1>
        <p className="text-sm text-slate-300">
          Adjust dimensions, shape and material to match your project. The 3D
          preview updates in real time.
        </p>
        <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <Configurator3D config={config} />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Parameters</h2>
        <div className="grid gap-3 text-xs text-slate-200">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleShapeChange('rect')}
              className={`rounded border px-2 py-1 ${
                config.shape === 'rect'
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-slate-700'
              }`}
            >
              Rectangle
            </button>
            <button
              onClick={() => handleShapeChange('rounded-rect')}
              className={`rounded border px-2 py-1 ${
                config.shape === 'rounded-rect'
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-slate-700'
              }`}
            >
              Rounded corners
            </button>
            <button
              onClick={() => handleShapeChange('ellipse')}
              className={`rounded border px-2 py-1 ${
                config.shape === 'ellipse'
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-slate-700'
              }`}
            >
              Ellipse
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span>Length (mm)</span>
            <input
              type="number"
              min={600}
              max={4000}
              value={config.lengthMm}
              onChange={e => updateField('lengthMm', Number(e.target.value))}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span>Width (mm)</span>
            <input
              type="number"
              min={400}
              max={1800}
              value={config.widthMm}
              onChange={e => updateField('widthMm', Number(e.target.value))}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
          </label>

          {config.shape === 'rounded-rect' && (
            <label className="flex flex-col gap-1">
              <span>Corner radius (mm)</span>
              <input
                type="number"
                min={20}
                max={400}
                value={config.edgeRadiusMm}
                onChange={e =>
                  updateField('edgeRadiusMm', Number(e.target.value))
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span>Thickness (mm)</span>
            <input
              type="number"
              min={18}
              max={50}
              value={config.thicknessMm}
              onChange={e =>
                updateField('thicknessMm', Number(e.target.value))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
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
