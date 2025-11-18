import { useMemo, useState } from 'react';
import { CustomShapeDetails, OutlinePoint, ParsedCustomOutline } from './customShapeTypes';
import { parseDxfOutline } from './dxfParser';

interface Props {
  value: CustomShapeDetails | null;
  onChange: (value: CustomShapeDetails | null) => void;
  onDimensions: (dimensions: { lengthMm: number; widthMm: number } | null) => void;
}

// Format file sizes so architects can quickly sanity check what was uploaded.
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Handles the upload field, parsing DXF files client-side and surfacing useful feedback.
const CustomShapeUpload: React.FC<Props> = ({ value, onChange, onDimensions }) => {
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsParsing(true);

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'dxf' && extension !== 'dwg') {
      setError('Only DXF or DWG files are supported.');
      setIsParsing(false);
      return;
    }

    if (extension === 'dxf') {
      const text = await file.text();
      const outline = parseDxfOutline(text);
      if (!outline.paths.length) {
        setError('No closed polylines were found in the DXF.');
        setIsParsing(false);
        return;
      }
      onChange({
        fileName: file.name,
        fileSize: file.size,
        fileType: 'dxf',
        uploadedAt: new Date().toISOString(),
        outline,
        notes: 'DXF parsed successfully.'
      });
      if (outline.bounds) {
        onDimensions({
          lengthMm: outline.bounds.maxX - outline.bounds.minX,
          widthMm: outline.bounds.maxY - outline.bounds.minY
        });
      }
    } else {
      const notes =
        'DWG uploads are stored for reference. Convert to DXF to preview the outline.';
      onChange({
        fileName: file.name,
        fileSize: file.size,
        fileType: 'dwg',
        uploadedAt: new Date().toISOString(),
        outline: null,
        notes
      });
      onDimensions(null);
      setError('DWG previews are not available yet. Please convert to DXF for visualization.');
    }

    setIsParsing(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Upload a DXF or DWG</span>
        <input
          type="file"
          accept=".dxf,.dwg"
          onChange={handleFileChange}
          className="text-slate-300"
        />
      </label>
      <p className="text-[0.7rem] text-slate-400">
        Upload a closed LWPOLYLINE exported in millimetres. The outline is used to build the
        preview and to keep your pricing accurate. DWG uploads are accepted but must be converted
        to DXF for on-screen rendering.
      </p>
      {isParsing && <p className="text-emerald-300">Analysing file…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {value && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
          <p className="font-medium">{value.fileName}</p>
          <p className="text-slate-400">{formatBytes(value.fileSize)}</p>
          <p className="text-slate-400">Uploaded {new Date(value.uploadedAt).toLocaleString()}</p>
          {value.notes && <p className="text-slate-400">{value.notes}</p>}
        </div>
      )}
      {value?.outline && value.outline.paths.length > 0 && (
        <CustomOutlinePreview outline={value.outline} />
      )}
    </div>
  );
};

// Lightweight SVG preview so users can sanity check the imported curve before jumping back to CAD.
const CustomOutlinePreview: React.FC<{ outline: ParsedCustomOutline }> = ({ outline }) => {
  const normalisedPaths = useMemo(() => {
    if (!outline.bounds) return [];
    const { minX, minY, maxX, maxY } = outline.bounds;
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    return outline.paths.map(path =>
      path.map(point => ({
        x: ((point.x - minX) / width) * 100,
        y: 100 - ((point.y - minY) / height) * 100
      }))
    );
  }, [outline]);

  if (!outline.bounds) return null;

  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <p className="mb-2 font-semibold text-slate-200">Outline preview</p>
      <svg viewBox="0 0 100 100" className="h-48 w-full rounded bg-slate-950">
        {normalisedPaths.map((path, index) => (
          <path
            key={index}
            d={buildPath(path)}
            fill={index === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(14, 116, 144, 0.2)'}
            stroke="#34d399"
            strokeWidth={0.5}
          />
        ))}
      </svg>
      <p className="mt-2 text-[0.7rem] text-slate-400">
        Bounding box: {Math.round(outline.bounds.maxX - outline.bounds.minX)} ×
        {Math.round(outline.bounds.maxY - outline.bounds.minY)} mm
      </p>
    </div>
  );
};

const buildPath = (points: OutlinePoint[]) => {
  if (!points.length) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
};

export default CustomShapeUpload;
