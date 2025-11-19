import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Html, Line } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';

import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ParsedCustomOutline, OutlinePoint } from './customShapeTypes';


export type TableShape =
  | 'rect'
  | 'rounded-rect'
  | 'round-top'
  | 'round'
  | 'ellipse'
  | 'super-ellipse'
  | 'custom';

export type EdgeProfile = 'edged' | 'painted-sharknose';

export interface TabletopConfig {
  shape: TableShape;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  edgeRadiusMm: number;
  superEllipseExponent: number;
  material: 'laminate' | 'timber' | 'linoleum';
  finish: 'matte' | 'satin';
  edgeProfile: EdgeProfile;
  quantity: number;
}

interface SurfaceSwatch {
  hexCode?: string;
  imageUrl?: string | null;
}

interface Props {
  config: TabletopConfig;
  customOutline?: ParsedCustomOutline | null;
  swatch?: SurfaceSwatch | null;
}

const MM_TO_M = 0.001;
// Keep the tabletop hovering at 720mm (0.72m) to resemble a real table height.
const TABLETOP_STANDING_HEIGHT_M = 0.72;

interface TabletopGeometryOptions {
  config: TabletopConfig;
  customOutline?: ParsedCustomOutline | null;
  swatch?: SurfaceSwatch | null;
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
  } else if (shape === 'round-top') {
    // Model a D-shaped top: one straight side and a fully rounded meeting end.
    const hw = width / 2;
    const hl = length / 2;
    const radius = hw;
    const straightEndX = hl - radius;
    const flatStartX = -hl;
    shape2d.moveTo(flatStartX, -hw);
    shape2d.lineTo(straightEndX, -hw);
    // Draw a semicircle that turns the end cap into a smooth round meeting space.
    shape2d.absarc(straightEndX, 0, radius, -Math.PI / 2, Math.PI / 2, false);
    shape2d.lineTo(flatStartX, hw);
    shape2d.lineTo(flatStartX, -hw);
  } else if (shape === 'round') {
    // Use the smaller of the two sliders as the diameter so the profile stays circular.
    const diameter = Math.min(length, width);
    const radius = diameter / 2;
    shape2d.moveTo(radius, 0);
    shape2d.absarc(0, 0, radius, 0, Math.PI * 2, false);
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

const TabletopMesh: React.FC<TabletopGeometryOptions> = ({ config, customOutline, swatch }) => {
  const geometry = useMemo(
    () => createTabletopGeometry({ config, customOutline }),
    [config, customOutline]
  );
  const [swatchTexture, setSwatchTexture] = useState<THREE.Texture | null>(null);

  // Load the supplier swatch image (if provided) so the 3D preview mirrors the catalogue selection.
  useEffect(() => {
    if (!swatch?.imageUrl) {
      setSwatchTexture(null);
      return;
    }

    let isMounted = true;
    let loadedTexture: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.load(
      swatch.imageUrl,
      texture => {
        if (!isMounted) {
          texture.dispose();
          return;
        }
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.anisotropy = 8;
        texture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture = texture;
        setSwatchTexture(texture);
      },
      undefined,
      () => {
        if (isMounted) {
          setSwatchTexture(null);
        }
      }
    );

    return () => {
      isMounted = false;
      setSwatchTexture(null);
      if (loadedTexture) {
        loadedTexture.dispose();
      }
    };
  }, [swatch?.imageUrl]);

  const fallbackMaterialColor =
    swatch?.hexCode?.trim() ||
    (config.material === 'linoleum'
      ? '#3f5c5c'
      : config.material === 'timber'
      ? '#b3825a'
      : '#d0d4da');

  const appliedMaterialColor = swatchTexture ? '#ffffff' : fallbackMaterialColor;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        // Apply the supplier texture when available, otherwise fall back to the HEX swatch.
        color={appliedMaterialColor}
        map={swatchTexture ?? undefined}
        metalness={0.1}
        roughness={config.finish === 'matte' ? 0.9 : 0.6}
      />
    </mesh>
  );
};

interface TableBaseProps {
  config: TabletopConfig;
}

// Adds a stylized meeting table base so every configuration feels grounded in the scene.
const TableBase: React.FC<TableBaseProps> = ({ config }) => {
  const length = config.lengthMm * MM_TO_M;
  const width = config.widthMm * MM_TO_M;
  const footThickness = 0.05;
  const columnHeight = TABLETOP_STANDING_HEIGHT_M - footThickness;
  // Keep the pedestals tucked under the overhang but spread wide enough for stability.
  const pedestalOffset = Math.max(Math.min(length * 0.35, 0.9), 0.45);
  const footWidth = Math.max(width * 0.6, 0.7);
  const footLength = 0.28;

  return (
    <group>
      {/* Tie both pedestals together with a slim support spine. */}
      <mesh
        position={[0, columnHeight - 0.1, 0]}
        castShadow
        receiveShadow
        rotation={[0, 0, 0]}
      >
        <boxGeometry args={[length * 0.5, 0.05, 0.12]} />
        <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.35} />
      </mesh>
      {[-1, 1].map(direction => (
        <group key={direction} position={[direction * pedestalOffset, 0, 0]}>
          {/* Floor plate keeps the columns visually attached to the room. */}
          <mesh position={[0, footThickness / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[footLength, footThickness, footWidth]} />
            <meshStandardMaterial color="#1f2937" roughness={0.8} metalness={0.1} />
          </mesh>
          {/* Cylindrical column rises to the underside of the tabletop. */}
          <mesh position={[0, footThickness + columnHeight / 2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.07, columnHeight, 24]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.4} metalness={0.7} />
          </mesh>
          {/* Small cap presses against the tabletop so gaps never appear. */}
          <mesh position={[0, TABLETOP_STANDING_HEIGHT_M - 0.01, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.02, 32]} />
            <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

interface MeetingRoomShellProps {
  config: TabletopConfig;
}

// Lightweight geometry that frames the table inside a recognizable meeting room.
const MeetingRoomShell: React.FC<MeetingRoomShellProps> = ({ config }) => {
  const length = config.lengthMm * MM_TO_M;
  const width = config.widthMm * MM_TO_M;
  const padding = 1.2;
  const roomLength = Math.max(5, length + padding * 2);
  const roomWidth = Math.max(4, width + padding * 2);
  const wallHeight = 2.8;

  return (
    <group>
      {/* Warm floor plane doubles as a rug to anchor the table. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[roomLength, roomWidth]} />
        <meshStandardMaterial color="#3a2f2b" roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <circleGeometry args={[Math.max(length, width) / 2 + 0.5, 64]} />
        <meshStandardMaterial color="#4a5568" roughness={0.85} metalness={0.1} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, wallHeight / 2, -roomWidth / 2]} receiveShadow>
        <planeGeometry args={[roomLength, wallHeight]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* Left + right walls stay short so the camera can orbit freely. */}
      {[-1, 1].map(direction => (
        <mesh key={direction} position={[direction * roomLength / 2, wallHeight / 2, 0]} rotation={[0, Math.PI / 2 * direction, 0]}>
          <planeGeometry args={[roomWidth, wallHeight]} />
          <meshStandardMaterial color="#111827" roughness={0.85} metalness={0.15} />
        </mesh>
      ))}
      {/* Diffused "window" casts a glow to hint at an exterior opening. */}
      <mesh position={[0, 1.6, -roomWidth / 2 + 0.01]}>
        <planeGeometry args={[roomLength * 0.5, 1]} />
        <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={0.5} transparent opacity={0.8} />
      </mesh>
    </group>
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

interface DimensionLabelProps {
  position: [number, number, number];
  text: string;
  rotation?: [number, number, number];
}

const DIMENSION_COLOR = '#fcd34d';
const DIMENSION_LABEL_CLASS =
  'pointer-events-none whitespace-nowrap rounded border border-amber-400/30 bg-slate-950/80 px-1.5 py-0.5 text-[0.55rem] font-semibold text-amber-100 shadow-lg backdrop-blur';

const DimensionLabel: React.FC<DimensionLabelProps> = ({ position, text, rotation }) => (
  <group position={position} rotation={rotation ?? [0, 0, 0]}>
    {/* Render the label in screen space so it stays crisp and retains a consistent size when zooming. */}
    <Html center sprite zIndexRange={[10, 0]}>
      <div className={DIMENSION_LABEL_CLASS}>{text}</div>
    </Html>
  </group>
);

interface WorldSpaceDimensionsProps {
  config: TabletopConfig;
  visible: boolean;
  view: ViewPreset;
}

// Render true 3D measurement lines so they stay attached to the tabletop even when the user orbits/zooms.
const WorldSpaceDimensions: React.FC<WorldSpaceDimensionsProps> = ({ config, visible, view }) => {
  if (!visible || view === '3d') return null;

  const length = config.lengthMm * MM_TO_M;
  const width = config.widthMm * MM_TO_M;
  const thickness = config.thicknessMm * MM_TO_M;
  const centerY = TABLETOP_STANDING_HEIGHT_M + thickness / 2;
  const topY = centerY + thickness / 2;
  const bottomY = centerY - thickness / 2;

  // Offsets keep the measurement lines readable without floating too far away from the mesh.
  const edgeOffset = 0.08;
  const heightOffset = 0.04;

  const lengthLineY = topY + heightOffset;
  const lengthLineZ = width / 2 + edgeOffset;
  const widthLineY = topY + heightOffset;
  const widthLineX = length / 2 + edgeOffset;
  const thicknessLineX = length / 2 + edgeOffset;
  const thicknessLineZ = width / 2 + edgeOffset * 0.7;

  const showLength = view === 'top' || view === 'front';
  const showWidth = view === 'top' || view === 'side';
  const showThickness = view !== 'top';

  const labelRotations: Record<Exclude<ViewPreset, '3d'>, [number, number, number]> = {
    top: [-Math.PI / 2, 0, 0],
    front: [0, 0, 0],
    side: [0, Math.PI / 2, 0]
  };

  const labelRotation = labelRotations[view as Exclude<ViewPreset, '3d'>];

  return (
    <group>
      {/* Length measurement */}
      {showLength && (
        <group>
          <Line
            points={[
              [-length / 2, lengthLineY, lengthLineZ],
              [length / 2, lengthLineY, lengthLineZ]
            ]}
            color={DIMENSION_COLOR}
            lineWidth={1.5}
          />
          {/* Connectors from the tabletop edge to the dimension line. */}
          <Line
            points={[
              [-length / 2, topY, width / 2],
              [-length / 2, lengthLineY, width / 2]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [-length / 2, lengthLineY, width / 2],
              [-length / 2, lengthLineY, lengthLineZ]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [length / 2, topY, width / 2],
              [length / 2, lengthLineY, width / 2]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [length / 2, lengthLineY, width / 2],
              [length / 2, lengthLineY, lengthLineZ]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <DimensionLabel
            position={[0, lengthLineY + 0.01, lengthLineZ]}
            text={`${config.lengthMm} mm`}
            rotation={labelRotation}
          />
        </group>
      )}

      {/* Width measurement */}
      {showWidth && (
        <group>
          <Line
            points={[
              [widthLineX, widthLineY, -width / 2],
              [widthLineX, widthLineY, width / 2]
            ]}
            color={DIMENSION_COLOR}
            lineWidth={1.5}
          />
          <Line
            points={[
              [length / 2, topY, -width / 2],
              [length / 2, widthLineY, -width / 2]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [length / 2, widthLineY, -width / 2],
              [widthLineX, widthLineY, -width / 2]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [length / 2, topY, width / 2],
              [length / 2, widthLineY, width / 2]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [length / 2, widthLineY, width / 2],
              [widthLineX, widthLineY, width / 2]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <DimensionLabel
            position={[widthLineX, widthLineY + 0.01, 0]}
            text={`${config.widthMm} mm`}
            rotation={labelRotation}
          />
        </group>
      )}

      {/* Thickness measurement */}
      {showThickness && (
        <group>
          <Line
            points={[
              [thicknessLineX, bottomY, thicknessLineZ],
              [thicknessLineX, topY, thicknessLineZ]
            ]}
            color={DIMENSION_COLOR}
            lineWidth={1.5}
          />
          <Line
            points={[
              [length / 2, bottomY, width / 2],
              [thicknessLineX, bottomY, thicknessLineZ]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <Line
            points={[
              [length / 2, topY, width / 2],
              [thicknessLineX, topY, thicknessLineZ]
            ]}
            color="#94a3b8"
            lineWidth={1}
          />
          <DimensionLabel
            position={[thicknessLineX + 0.01, centerY, thicknessLineZ]}
            text={`${config.thicknessMm} mm`}
            rotation={labelRotation}
          />
        </group>
      )}
    </group>
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

const Configurator3D: React.FC<Props> = ({ config, customOutline, swatch }) => {
  // Convert the tabletop thickness to meters so we can offset the mesh when
  // we rotate it. Without the offset, half the tabletop would sink below the
  // origin once we lay it flat.
  const tabletopThickness = config.thicknessMm * MM_TO_M;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [activeView, setActiveView] = useState<ViewPreset>('3d');
  const [showDimensions, setShowDimensions] = useState(true);
  const is3DView = activeView === '3d';
  const dimensionsVisible = showDimensions && !is3DView;
  const dimensionToggleEnabled = !is3DView;
  const dimensionToggleActive = dimensionsVisible;
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
        const fileBase = `top-store-${safeShapeName}-${config.lengthMm}x${config.widthMm}`;

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
        <color attach="background" args={['#0b1220']} />
        <ambientLight intensity={0.55} />
        {/* Soft indoor lighting for the meeting room shell. */}
        <directionalLight
          position={[4, 6, 3]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <spotLight
          position={[-3, 5, 2]}
          angle={0.7}
          penumbra={0.5}
          intensity={0.6}
          castShadow
        />
        <MeetingRoomShell config={config} />
        <TableBase config={config} />
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLETOP_STANDING_HEIGHT_M + tabletopThickness / 2, 0]}>
          {/* Rotate the tabletop so it lays horizontally in the viewport. */}
          <TabletopMesh config={config} customOutline={customOutline} swatch={swatch} />
        </group>
        <WorldSpaceDimensions config={config} visible={dimensionsVisible} view={activeView} />
        <OrbitControls ref={controlsRef} enablePan={is3DView} enableRotate={is3DView} enableZoom />
        <Environment preset="lobby" />
        <CameraViewUpdater preset={activeView} controlsRef={controlsRef} viewTargets={viewTargets} />
      </Canvas>

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
              onClick={() => dimensionToggleEnabled && setShowDimensions(prev => !prev)}
              disabled={!dimensionToggleEnabled}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xs font-medium transition ${
                dimensionToggleActive
                  ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                  : 'border-white/15 text-slate-200 hover:border-emerald-300/70'
              } ${!dimensionToggleEnabled ? 'cursor-not-allowed opacity-50 hover:border-white/15' : ''}`}
              title={
                dimensionToggleEnabled
                  ? 'Toggle overall dimension overlay'
                  : 'Dimensions are only available in plan, front, or side views'
              }
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
