import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OutlinePoint, ParsedCustomOutline } from './customShapeTypes';


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

const TabletopMesh: React.FC<Props> = ({ config, customOutline }) => {
  const { shape, lengthMm, widthMm, thicknessMm, edgeRadiusMm, superEllipseExponent } = config;

  const geometry = useMemo(() => {
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
      const ellipseCurve = new THREE.EllipseCurve(
        0,
        0,
        xRadius,
        yRadius,
        0,
        Math.PI * 2
      );
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
      shape2d.quadraticCurveTo(
        x + length,
        y + width,
        x + length - r,
        y + width
      );
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
  }, [
    shape,
    lengthMm,
    widthMm,
    thicknessMm,
    edgeRadiusMm,
    superEllipseExponent,
    customOutline
  ]);

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

      <div className="pointer-events-none absolute inset-0 flex justify-end p-3">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Configurator3D;
