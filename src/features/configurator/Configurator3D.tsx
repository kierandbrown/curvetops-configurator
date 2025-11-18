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

  outerPath.forEach((point: OutlinePoint, index: number) => {
    const { x, y } = toMeters(point);
    if (index === 0) {
      shape2d.moveTo(x, y);
    } else {
      shape2d.lineTo(x, y);
    }
  });
  shape2d.closePath();

  outline.paths.slice(1).forEach((path: OutlinePoint[]) => {
    if (!path.length) return;
    const hole = new THREE.Path();
    path.forEach((point: OutlinePoint, index: number) => {
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

interface LinkedDimensionOverlayProps {
  config: TabletopConfig;
  activeView: ViewPreset;
  visible: boolean;
}

interface DimensionLineLayout {
  key: string;
  orientation: 'horizontal' | 'vertical';
  value: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  label: { x: number; y: number };
  connectors?: { x1: number; y1: number; x2: number; y2: number }[];
}

interface DimensionViewLayout {
  shape: { x: number; y: number; width: number; height: number; rx?: number; ry?: number };
  lines: DimensionLineLayout[];
}

type RectPadding = Partial<{ top: number; right: number; bottom: number; left: number }> | number;

const VIEWBOX_SIZE = 100;
const DIMENSION_GAP = 6;

const resolvePadding = (padding?: RectPadding) => {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }

  return {
    top: padding?.top ?? 16,
    right: padding?.right ?? 16,
    bottom: padding?.bottom ?? 16,
    left: padding?.left ?? 16
  };
};

const buildReferenceRect = (
  widthMm: number,
  heightMm: number,
  options?: { padding?: RectPadding; alignY?: 'top' | 'center' | 'bottom' }
) => {
  const padding = resolvePadding(options?.padding);
  const widthAvailable = VIEWBOX_SIZE - padding.left - padding.right;
  const heightAvailable = VIEWBOX_SIZE - padding.top - padding.bottom;
  const safeWidth = Math.max(widthMm, 1);
  const safeHeight = Math.max(heightMm, 1);
  const scale = Math.min(widthAvailable / safeWidth, heightAvailable / safeHeight);
  const width = safeWidth * scale;
  const height = safeHeight * scale;
  const x = padding.left + (widthAvailable - width) / 2;

  let y = padding.top + (heightAvailable - height) / 2;
  if (options?.alignY === 'top') {
    y = padding.top;
  } else if (options?.alignY === 'bottom') {
    y = VIEWBOX_SIZE - padding.bottom - height;
  }

  return { x, y, width, height };
};

// Draw lightweight measurement lines that hug the model instead of a block of explanatory text.
const LinkedDimensionOverlay: React.FC<LinkedDimensionOverlayProps> = ({ config, activeView, visible }) => {
  if (!visible || activeView === '3d') {
    return null;
  }

  const { lengthMm, widthMm, thicknessMm } = config;

  // Normalize each view to the same 0-100 coordinate system so the SVG can scale with
  // the canvas size. The helper above scales each rectangle proportionally so the
  // measurement arrows always touch the true extents of the tabletop no matter the size.
  const topRect = buildReferenceRect(lengthMm, widthMm, {
    padding: { top: 20, right: 22, bottom: 20, left: 22 }
  });
  const frontRect = buildReferenceRect(lengthMm, thicknessMm, {
    padding: { top: 40, right: 20, bottom: 18, left: 20 },
    alignY: 'bottom'
  });
  const sideRect = buildReferenceRect(widthMm, thicknessMm, {
    padding: { top: 40, right: 20, bottom: 18, left: 20 },
    alignY: 'bottom'
  });
  const frontHeight = Math.max(frontRect.height, 1.2);
  const sideHeight = Math.max(sideRect.height, 1.2);

  // Describe how each orthographic view should render its reference rectangle and measurement lines.
  // Using normalized coordinates (0-100) inside the viewBox keeps the math simple and ensures the overlay
  // scales with the canvas size.
  const viewLayouts: Record<'top' | 'front' | 'side', DimensionViewLayout> = {
    top: {
      shape: {
        x: topRect.x,
        y: topRect.y,
        width: topRect.width,
        height: topRect.height,
        rx: Math.min(8, topRect.height / 2),
        ry: Math.min(8, topRect.height / 2)
      },
      lines: [
        {
          key: 'length',
          orientation: 'horizontal',
          value: `${lengthMm} mm`,
          start: { x: topRect.x, y: topRect.y - DIMENSION_GAP },
          end: { x: topRect.x + topRect.width, y: topRect.y - DIMENSION_GAP },
          label: {
            x: topRect.x + topRect.width / 2,
            y: topRect.y - DIMENSION_GAP - 4
          },
          connectors: [
            { x1: topRect.x, y1: topRect.y, x2: topRect.x, y2: topRect.y - DIMENSION_GAP },
            {
              x1: topRect.x + topRect.width,
              y1: topRect.y,
              x2: topRect.x + topRect.width,
              y2: topRect.y - DIMENSION_GAP
            }
          ]
        },
        {
          key: 'width',
          orientation: 'vertical',
          value: `${widthMm} mm`,
          start: { x: topRect.x - DIMENSION_GAP, y: topRect.y },
          end: { x: topRect.x - DIMENSION_GAP, y: topRect.y + topRect.height },
          label: {
            x: topRect.x - DIMENSION_GAP - 5,
            y: topRect.y + topRect.height / 2
          },
          connectors: [
            { x1: topRect.x, y1: topRect.y, x2: topRect.x - DIMENSION_GAP, y2: topRect.y },
            {
              x1: topRect.x,
              y1: topRect.y + topRect.height,
              x2: topRect.x - DIMENSION_GAP,
              y2: topRect.y + topRect.height
            }
          ]
        }
      ]
    },
    front: {
      shape: {
        x: frontRect.x,
        y: frontRect.y,
        width: frontRect.width,
        height: frontHeight,
        rx: 2,
        ry: 2
      },
      lines: [
        {
          key: 'length',
          orientation: 'horizontal',
          value: `${lengthMm} mm`,
          start: { x: frontRect.x, y: frontRect.y - DIMENSION_GAP },
          end: { x: frontRect.x + frontRect.width, y: frontRect.y - DIMENSION_GAP },
          label: {
            x: frontRect.x + frontRect.width / 2,
            y: frontRect.y - DIMENSION_GAP - 4
          },
          connectors: [
            { x1: frontRect.x, y1: frontRect.y, x2: frontRect.x, y2: frontRect.y - DIMENSION_GAP },
            {
              x1: frontRect.x + frontRect.width,
              y1: frontRect.y,
              x2: frontRect.x + frontRect.width,
              y2: frontRect.y - DIMENSION_GAP
            }
          ]
        },
        {
          key: 'thickness-front',
          orientation: 'vertical',
          value: `${thicknessMm} mm`,
          start: {
            x: frontRect.x + frontRect.width + DIMENSION_GAP,
            y: frontRect.y
          },
          end: {
            x: frontRect.x + frontRect.width + DIMENSION_GAP,
            y: frontRect.y + frontHeight
          },
          label: {
            x: frontRect.x + frontRect.width + DIMENSION_GAP + 5,
            y: frontRect.y + frontHeight / 2
          },
          connectors: [
            {
              x1: frontRect.x + frontRect.width,
              y1: frontRect.y,
              x2: frontRect.x + frontRect.width + DIMENSION_GAP,
              y2: frontRect.y
            },
            {
              x1: frontRect.x + frontRect.width,
              y1: frontRect.y + frontHeight,
              x2: frontRect.x + frontRect.width + DIMENSION_GAP,
              y2: frontRect.y + frontHeight
            }
          ]
        }
      ]
    },
    side: {
      shape: {
        x: sideRect.x,
        y: sideRect.y,
        width: sideRect.width,
        height: sideHeight,
        rx: 2,
        ry: 2
      },
      lines: [
        {
          key: 'width-side',
          orientation: 'horizontal',
          value: `${widthMm} mm`,
          start: { x: sideRect.x, y: sideRect.y - DIMENSION_GAP },
          end: { x: sideRect.x + sideRect.width, y: sideRect.y - DIMENSION_GAP },
          label: {
            x: sideRect.x + sideRect.width / 2,
            y: sideRect.y - DIMENSION_GAP - 4
          },
          connectors: [
            { x1: sideRect.x, y1: sideRect.y, x2: sideRect.x, y2: sideRect.y - DIMENSION_GAP },
            {
              x1: sideRect.x + sideRect.width,
              y1: sideRect.y,
              x2: sideRect.x + sideRect.width,
              y2: sideRect.y - DIMENSION_GAP
            }
          ]
        },
        {
          key: 'thickness-side',
          orientation: 'vertical',
          value: `${thicknessMm} mm`,
          start: {
            x: sideRect.x + sideRect.width + DIMENSION_GAP,
            y: sideRect.y
          },
          end: {
            x: sideRect.x + sideRect.width + DIMENSION_GAP,
            y: sideRect.y + sideHeight
          },
          label: {
            x: sideRect.x + sideRect.width + DIMENSION_GAP + 5,
            y: sideRect.y + sideHeight / 2
          },
          connectors: [
            {
              x1: sideRect.x + sideRect.width,
              y1: sideRect.y,
              x2: sideRect.x + sideRect.width + DIMENSION_GAP,
              y2: sideRect.y
            },
            {
              x1: sideRect.x + sideRect.width,
              y1: sideRect.y + sideHeight,
              x2: sideRect.x + sideRect.width + DIMENSION_GAP,
              y2: sideRect.y + sideHeight
            }
          ]
        }
      ]
    }
  };

  const layout = viewLayouts[activeView as 'top' | 'front' | 'side'];

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="h-full w-full text-emerald-200"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="dimension-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
          </marker>
        </defs>
        <rect
          x={layout.shape.x}
          y={layout.shape.y}
          width={layout.shape.width}
          height={layout.shape.height}
          rx={layout.shape.rx ?? 0}
          ry={layout.shape.ry ?? 0}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={1.2}
        />
        {layout.lines.map(line => (
          <g key={line.key}>
            {line.connectors?.map((connector, index) => (
              <line
                key={`${line.key}-connector-${index}`}
                x1={connector.x1}
                y1={connector.y1}
                x2={connector.x2}
                y2={connector.y2}
                stroke="currentColor"
                strokeWidth={0.8}
                strokeOpacity={0.6}
                strokeDasharray="4 2"
              />
            ))}
            <line
              x1={line.start.x}
              y1={line.start.y}
              x2={line.end.x}
              y2={line.end.y}
              stroke="currentColor"
              strokeWidth={1.2}
              markerStart="url(#dimension-arrow)"
              markerEnd="url(#dimension-arrow)"
            />
            <text
              x={line.label.x}
              y={line.label.y}
              fill="currentColor"
              fontSize={4.2}
              fontWeight={600}
              textAnchor="middle"
              transform={
                line.orientation === 'vertical'
                  ? `rotate(-90 ${line.label.x} ${line.label.y})`
                  : undefined
              }
            >
              {line.value}
            </text>
          </g>
        ))}
      </svg>
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
  // Controls whether the export modal overlay is visible so the control can be reused on desktop + mobile.
  const [showExportModal, setShowExportModal] = useState(false);
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

      <LinkedDimensionOverlay config={config} activeView={activeView} visible={showDimensions} />

      {/* Toolbar overlays keep export + view controls reachable without blocking the canvas. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-3 sm:flex-row sm:justify-end">
        <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/80 p-2 shadow-xl backdrop-blur">
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
            {/* Export button sits directly below the dimension toggle per UX request. */}
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="mt-2 flex w-full items-center justify-center rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-400/20"
            >
              Export model
            </button>
          </div>
        </div>
      </div>

      {/* Lightweight modal overlay keeps the existing export helper content but only surfaces it when needed. */}
      {showExportModal && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Export tabletop model"
          onClick={() => {
            setShowExportModal(false);
            setExportMenuOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl backdrop-blur"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Export model</p>
                <p className="mt-1 text-[0.8rem] text-slate-200">
                  Choose a CAD-friendly format so estimators, CNC programmers or 3D printers can review this configuration with
                  dimensions and bevels intact.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowExportModal(false);
                  setExportMenuOpen(false);
                }}
                className="rounded-full border border-white/15 p-2 text-slate-300 transition hover:border-emerald-400 hover:text-emerald-200"
                aria-label="Close export modal"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Select format</p>
              <button
                type="button"
                onClick={() => setExportMenuOpen(prev => !prev)}
                className="w-full rounded-lg border border-emerald-400 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
              >
                {exportMenuOpen ? 'Hide available formats' : 'Show available formats'}
              </button>
              <p className="text-[0.75rem] text-slate-400">
                Tip: GLB is the most compact all-in-one file, STL is ideal for neutral manufacturing, and OBJ keeps compatibility with legacy modeling suites.
              </p>
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
                className={`mt-3 text-[0.8rem] ${
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
        </div>
      )}
    </div>
  );
};

export default Configurator3D;
