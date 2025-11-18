import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';

import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ParsedCustomOutline } from './customShapeTypes';


export type TableShape = 'rect' | 'rounded-rect' | 'ellipse' | 'super-ellipse' | 'custom';

export interface TabletopConfig {
  shape: TableShape;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  edgeRadiusMm: number;
  superEllipseExponent: number;
  material: 'laminate' | 'timber' | 'linoleum';
  finish: 'matte' | 'satin';
  quantity: number;
}

interface Props {
  config: TabletopConfig;
  customOutline?: ParsedCustomOutline | null;
}

const MM_TO_M = 0.001;
// Keep the tabletop hovering at 720mm (0.72m) to resemble a real table height.
const TABLETOP_STANDING_HEIGHT_M = 0.72;

interface TabletopGeometryOptions {
  config: TabletopConfig;
  customOutline?: ParsedCustomOutline | null;
}

// Build an extruded mesh from the uploaded DXF outline so it can share the same
// lighting + material pipeline as the procedural shapes.
const buildCustomGeometry = (
  outline: ParsedCustomOutline,
  thicknessMm: number
): THREE.ExtrudeGeometry | null => {
  if (!outline.bounds || !outline.paths.length) {
    return null;
  }

  const centerX = (outline.bounds.minX + outline.bounds.maxX) / 2;
  const centerY = (outline.bounds.minY + outline.bounds.maxY) / 2;
  const shape2d = new THREE.Shape();
  const toMeters = (point: { x: number; y: number }) => ({
    x: (point.x - centerX) * MM_TO_M,
    y: (point.y - centerY) * MM_TO_M
  });

  const outerPath = outline.paths[0];
  if (!outerPath?.length) {
    return null;
  }

  outerPath.forEach((point, index) => {
    const { x, y } = toMeters(point);
    if (index === 0) {
      shape2d.moveTo(x, y);
    } else {
      shape2d.lineTo(x, y);
    }
  });
  shape2d.closePath();

  outline.paths.slice(1).forEach(path => {
    if (!path.length) return;
    const hole = new THREE.Path();
    path.forEach((point, index) => {
      const { x, y } = toMeters(point);
      if (index === 0) {
        hole.moveTo(x, y);
      } else {
        hole.lineTo(x, y);
      }
    });
    hole.closePath();
    shape2d.holes.push(hole);
  });

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: thicknessMm * MM_TO_M,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2
  };

  return new THREE.ExtrudeGeometry(shape2d, extrudeSettings);
};

const createTabletopGeometry = ({ config, customOutline }: TabletopGeometryOptions) => {
  const { shape, lengthMm, widthMm, thicknessMm, edgeRadiusMm, superEllipseExponent } = config;

  if (shape === 'custom' && customOutline?.paths.length && customOutline.bounds) {
    const customGeometry = buildCustomGeometry(customOutline, thicknessMm);
    if (customGeometry) {
      return customGeometry;
    }
  }

  const length = lengthMm * MM_TO_M;
  const width = widthMm * MM_TO_M;
  const thickness = thicknessMm * MM_TO_M;

  const shape2d = new THREE.Shape();

  if (shape === 'ellipse') {
    const xRadius = length / 2;
    const yRadius = width / 2;
    const segments = 64;
    const ellipseCurve = new THREE.EllipseCurve(0, 0, xRadius, yRadius, 0, Math.PI * 2);
    const points = ellipseCurve.getPoints(segments);
    shape2d.moveTo(points[0].x, points[0].y);
    points.forEach(p => shape2d.lineTo(p.x, p.y));
  } else if (shape === 'super-ellipse') {
    const a = length / 2;
    const b = width / 2;
    const segments = 128;
    // Clamp the exponent so the geometry can't become unstable.
    const exponent = THREE.MathUtils.clamp(superEllipseExponent, 1.5, 8);
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const x = a * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent);
      const y = b * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent);
      if (i === 0) {
        shape2d.moveTo(x, y);
      } else {
        shape2d.lineTo(x, y);
      }
    }
  } else if (shape === 'rounded-rect') {
    const hw = width / 2;
    const hl = length / 2;
    const r = Math.min(edgeRadiusMm * MM_TO_M, hw, hl);
    const x = -hl;
    const y = -hw;
    shape2d.moveTo(x + r, y);
    shape2d.lineTo(x + length - r, y);
    shape2d.quadraticCurveTo(x + length, y, x + length, y + r);
    shape2d.lineTo(x + length, y + width - r);
    shape2d.quadraticCurveTo(x + length, y + width, x + length - r, y + width);
    shape2d.lineTo(x + r, y + width);
    shape2d.quadraticCurveTo(x, y + width, x, y + width - r);
    shape2d.lineTo(x, y + r);
    shape2d.quadraticCurveTo(x, y, x + r, y);
  } else {
    const hw = width / 2;
    const hl = length / 2;
    shape2d.moveTo(-hl, -hw);
    shape2d.lineTo(hl, -hw);
    shape2d.lineTo(hl, hw);
    shape2d.lineTo(-hl, hw);
    shape2d.lineTo(-hl, -hw);
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2
  };

  return new THREE.ExtrudeGeometry(shape2d, extrudeSettings);
};

const TabletopMesh: React.FC<TabletopGeometryOptions> = ({ config, customOutline }) => {
  const geometry = useMemo(
    () => createTabletopGeometry({ config, customOutline }),
    [config, customOutline]
  );

  const materialColor =
    config.material === 'linoleum'
      ? '#3f5c5c'
      : config.material === 'timber'
      ? '#b3825a'
      : '#d0d4da';

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={materialColor}
        metalness={0.1}
        roughness={config.finish === 'matte' ? 0.9 : 0.6}
      />
    </mesh>
  );
};

type ViewPreset = 'top' | 'front' | 'side' | '3d';

// Simple SVG helpers so each view button has a recognizable icon.
const IconTop = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width={20} height={20} className="text-slate-200">
    <rect x={5} y={5} width={14} height={14} rx={2} ry={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <rect x={8} y={8} width={8} height={8} fill="none" stroke="currentColor" strokeWidth={1.5} />
  </svg>
);

const IconFront = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width={20} height={20} className="text-slate-200">
    <rect x={4} y={7} width={16} height={10} rx={1.5} ry={1.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <line x1={4} y1={14} x2={20} y2={14} stroke="currentColor" strokeWidth={1.5} />
  </svg>
);

const IconSide = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width={20} height={20} className="text-slate-200">
    <rect x={7} y={6} width={10} height={12} rx={2} ry={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <line x1={12} y1={6} x2={12} y2={18} stroke="currentColor" strokeWidth={1.5} />
  </svg>
);

const IconIso = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width={20} height={20} className="text-slate-200">
    <path
      d="M7 9L12 6L17 9V15L12 18L7 15Z"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
    <path d="M7 9L12 12L17 9" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    <path d="M12 12V18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
  </svg>
);

const IconRuler = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width={20} height={20} className="text-slate-200">
    <rect x={3} y={5} width={18} height={14} rx={2} ry={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
    <path d="M7 5V8M11 5V9M15 5V8M7 19V16M11 19V15M15 19V16" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
  </svg>
);

interface DimensionOverlayProps {
  config: TabletopConfig;
  activeView: ViewPreset;
  visible: boolean;
}

// Render a small glyph so the overlay hints at the direction of each dimension line.
const DimensionGlyph: React.FC<{ orientation: 'horizontal' | 'vertical' }> = ({ orientation }) => {
  const isHorizontal = orientation === 'horizontal';
  return (
    <svg
      viewBox={isHorizontal ? '0 0 120 24' : '0 0 24 120'}
      className={`text-emerald-200 ${isHorizontal ? 'h-6 w-24' : 'h-24 w-6'}`}
      aria-hidden="true"
    >
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
        </marker>
      </defs>
      {isHorizontal ? (
        <g>
          <line x1="10" y1="12" x2="110" y2="12" stroke="currentColor" strokeWidth="2" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
          <line x1="60" y1="5" x2="60" y2="19" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
        </g>
      ) : (
        <g>
          <line x1="12" y1="10" x2="12" y2="110" stroke="currentColor" strokeWidth="2" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
          <line x1="5" y1="60" x2="19" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
        </g>
      )}
    </svg>
  );
};

// Overlay that communicates the current view's overall dimensions in a compact card.
const DimensionOverlay: React.FC<DimensionOverlayProps> = ({ config, activeView, visible }) => {
  if (!visible || !['top', 'front', 'side'].includes(activeView)) {
    return null;
  }

  const { lengthMm, widthMm, thicknessMm } = config;

  // Map each orthographic preset to the dimensions that matter for that view.
  // Keeping this derived data inside the component means the text reacts instantly
  // whenever the sliders in the configurator change.
  const viewDimensions = {
    top: {
      title: 'Plan (Top) Dimensions',
      lines: [
        { label: 'Overall Length', value: `${lengthMm} mm`, orientation: 'horizontal' as const },
        { label: 'Overall Width', value: `${widthMm} mm`, orientation: 'vertical' as const }
      ]
    },
    front: {
      title: 'Front Elevation Dimensions',
      lines: [
        { label: 'Overall Length', value: `${lengthMm} mm`, orientation: 'horizontal' as const },
        { label: 'Thickness', value: `${thicknessMm} mm`, orientation: 'vertical' as const }
      ]
    },
    side: {
      title: 'Side Elevation Dimensions',
      lines: [
        { label: 'Overall Width', value: `${widthMm} mm`, orientation: 'horizontal' as const },
        { label: 'Thickness', value: `${thicknessMm} mm`, orientation: 'vertical' as const }
      ]
    }
  } as const;

  const content = viewDimensions[activeView];

  return (
    // Pin the overlay to the top edge of the viewport so it never feels like a modal obscuring
    // the 3D scene. Pointer events remain disabled so the canvas underneath stays interactive.
    <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center px-3 pt-3 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/80 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">{content.title}</p>
            <p className="mt-1 text-sm text-slate-200">
              These values mirror the live sliders below so the plan stays anchored to the top edge instead of obscuring the preview.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Adjust any dimension to instantly refresh these readouts.
          </p>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {content.lines.map(line => (
            <li key={line.label} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <DimensionGlyph orientation={line.orientation} />
              <div>
                <p className="text-[0.7rem] uppercase tracking-wider text-slate-400">{line.label}</p>
                <p className="text-base font-semibold text-white">{line.value}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

interface CameraViewUpdaterProps {
  preset: ViewPreset;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  viewTargets: Record<ViewPreset, { position: [number, number, number]; target: [number, number, number] }>;
}

// Bridge React state to the underlying three.js camera so each preset is applied immediately.
const CameraViewUpdater: React.FC<CameraViewUpdaterProps> = ({ preset, controlsRef, viewTargets }) => {
  const { camera } = useThree();

  useEffect(() => {
    const config = viewTargets[preset];
    camera.position.set(...config.position);
    camera.lookAt(...config.target);
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(...config.target);
      controlsRef.current.update();
    }
  }, [preset, camera, viewTargets, controlsRef]);

  return null;
};

type ExportFormat = 'glb' | 'stl' | 'obj';

const formatLabels: Record<ExportFormat, string> = {
  glb: 'GLB (glTF)',
  stl: 'STL',
  obj: 'OBJ'
};

const Configurator3D: React.FC<{ config: TabletopConfig; customOutline?: ParsedCustomOutline | null }> = ({
  config,
  customOutline
}) => {
  // Convert the tabletop thickness to meters so we can offset the mesh when
  // we rotate it. Without the offset, half the tabletop would sink below the
  // origin once we lay it flat.
  const tabletopThickness = config.thicknessMm * MM_TO_M;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [activeView, setActiveView] = useState<ViewPreset>('3d');
  const [showDimensions, setShowDimensions] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportState, setExportState] = useState<{
    status: 'idle' | 'working' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  const tableCenter = useMemo<[number, number, number]>(
    () => [0, TABLETOP_STANDING_HEIGHT_M + tabletopThickness / 2, 0],
    [tabletopThickness]
  );

  // Describe the camera position and target for each preset. Using useMemo avoids re-allocating
  // the objects on every render and keeps the camera updates predictable.
  const viewTargets = useMemo(
    () => ({
      '3d': { position: [1.5, 1.3, 1.5] as [number, number, number], target: tableCenter },
      top: { position: [0, tableCenter[1] + 2.5, 0.0001] as [number, number, number], target: tableCenter },
      front: { position: [0, tableCenter[1], 2.6] as [number, number, number], target: tableCenter },
      side: { position: [2.6, tableCenter[1], 0] as [number, number, number], target: tableCenter }
    }),
    [tableCenter]
  );

  const viewButtons: { key: ViewPreset; label: string; icon: JSX.Element; help: string }[] = [
    { key: 'top', label: 'Top', icon: <IconTop />, help: 'Look straight down to check the plan view.' },
    { key: 'front', label: 'Front', icon: <IconFront />, help: 'Review thickness and edge profile from the front.' },
    { key: 'side', label: 'Side', icon: <IconSide />, help: 'Inspect proportions from the side elevation.' },
    { key: '3d', label: '3D', icon: <IconIso />, help: 'Return to an isometric orbit view.' }
  ];

  // Helper used by every exporter to trigger a browser download without adding dependencies.
  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = useCallback(
    (format: ExportFormat) => {
      try {
        // Surface immediate feedback so buyers know the request is being processed.
        setExportState({ status: 'working', message: `Preparing ${formatLabels[format]} download…` });
        const geometry = createTabletopGeometry({ config, customOutline });
        const materialColor =
          config.material === 'linoleum'
            ? '#3f5c5c'
            : config.material === 'timber'
            ? '#b3825a'
            : '#d0d4da';
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: materialColor,
            metalness: 0.1,
            roughness: config.finish === 'matte' ? 0.9 : 0.6
          })
        );
        mesh.updateMatrixWorld(true);

        const safeShapeName = config.shape.replace(/[^a-z0-9-]/gi, '-');
        const fileBase = `curvetops-${safeShapeName}-${config.lengthMm}x${config.widthMm}`;

        if (format === 'glb') {
          // GLB is the smallest all-in-one option so we default to a binary export.
          const exporter = new GLTFExporter();
          exporter.parse(
            mesh,
            result => {
              const output = result as ArrayBuffer;
              saveBlob(new Blob([output], { type: 'model/gltf-binary' }), `${fileBase}.glb`);
              setExportState({ status: 'success', message: 'GLB downloaded for use in BIM/CAD apps.' });
            },
            { binary: true }
          );
        } else if (format === 'stl') {
          // STL remains the lingua franca for CAM + 3D printing.
          const exporter = new STLExporter();
          const data = exporter.parse(mesh);
          saveBlob(new Blob([data], { type: 'model/stl' }), `${fileBase}.stl`);
          setExportState({ status: 'success', message: 'STL exported for quick 3D print checks.' });
        } else {
          // OBJ is included for backwards compatibility with older modeling suites.
          const exporter = new OBJExporter();
          const data = exporter.parse(mesh);
          saveBlob(new Blob([data], { type: 'text/plain' }), `${fileBase}.obj`);
          setExportState({ status: 'success', message: 'OBJ exported for legacy modeling tools.' });
        }

        geometry.dispose();
      } catch (error) {
        console.error('Export failed', error);
        setExportState({ status: 'error', message: 'Unable to export model. Please try again.' });
      } finally {
        setExportMenuOpen(false);
      }
    },
    [config, customOutline]
  );

  const exportOptions: { format: ExportFormat; description: string }[] = [
    {
      format: 'glb',
      description: 'Compact glTF binary ready for AR viewers.'
    },
    {
      format: 'stl',
      description: 'Neutral solid for machining + 3D prints.'
    },
    {
      format: 'obj',
      description: 'Legacy mesh that imports everywhere.'
    }
  ];

  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [1.5, 1.3, 1.5], fov: 40 }} shadows dpr={[1, 2]}>
        <color attach="background" args={['#020617']} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[4, 6, 3]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLETOP_STANDING_HEIGHT_M + tabletopThickness / 2, 0]}>
          {/* Rotate the tabletop so it lays horizontally in the viewport. */}
          <TabletopMesh config={config} customOutline={customOutline} />
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[5, 5]} />
          <meshStandardMaterial color="#020617" />
        </mesh>
        <OrbitControls ref={controlsRef} enablePan enableRotate enableZoom />
        <Environment preset="warehouse" />
        <CameraViewUpdater preset={activeView} controlsRef={controlsRef} viewTargets={viewTargets} />
      </Canvas>

      <DimensionOverlay config={config} activeView={activeView} visible={showDimensions} />

      {/* Toolbar overlays keep export + view controls reachable without blocking the canvas. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-3 sm:flex-row sm:justify-between">
        <div className="pointer-events-auto max-w-sm rounded-xl border border-white/10 bg-slate-900/80 p-3 shadow-xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Export model</p>
          <p className="mt-1 text-[0.75rem] text-slate-300">
            Download this tabletop as a 3D file so estimators or CNC operators can inspect the live configuration.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExportMenuOpen(prev => !prev)}
              className="flex-1 rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
            >
              {exportMenuOpen ? 'Hide formats' : 'Choose format'}
            </button>
            <span className="flex-1 text-[0.7rem] text-slate-400">
              GLB, STL and OBJ exports keep dimension and bevel data intact.
            </span>
          </div>
          {exportMenuOpen && (
            <ul className="mt-3 space-y-2 rounded-lg border border-white/10 bg-slate-950/90 p-2">
              {exportOptions.map(option => (
                <li key={option.format}>
                  <button
                    type="button"
                    onClick={() => handleExport(option.format)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{formatLabels[option.format]}</span>
                      <span className="text-[0.65rem] text-slate-400">Tap to export</span>
                    </div>
                    <p className="text-[0.7rem] text-slate-400">{option.description}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {exportState.message && (
            <p
              className={`mt-2 text-[0.75rem] ${
                exportState.status === 'error'
                  ? 'text-rose-300'
                  : exportState.status === 'working'
                  ? 'text-amber-200'
                  : 'text-emerald-200'
              }`}
            >
              {exportState.message}
            </p>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/80 p-2 shadow-xl backdrop-blur sm:ml-auto">
          {viewButtons.map(button => (
            <button
              key={button.key}
              type="button"
              onClick={() => setActiveView(button.key)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xs font-medium text-slate-200 transition ${
                activeView === button.key
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                  : 'border-white/15 hover:border-emerald-300/70'
              }`}
              title={`${button.label} view – ${button.help}`}
            >
              {button.icon}
              <span className="sr-only">{button.label} view</span>
            </button>
          ))}
          <div className="mt-1 border-t border-white/10 pt-1">
            <button
              type="button"
              onClick={() => setShowDimensions(prev => !prev)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xs font-medium transition ${
                showDimensions
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                  : 'border-white/15 text-slate-200 hover:border-emerald-300/70'
              }`}
              title="Toggle overall dimension overlay"
            >
              <IconRuler />
              <span className="sr-only">Toggle overall dimensions</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Configurator3D;
