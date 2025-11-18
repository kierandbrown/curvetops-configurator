import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

export type TableShape = 'rect' | 'rounded-rect' | 'ellipse';

export interface TabletopConfig {
  shape: TableShape;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  edgeRadiusMm: number;
  material: 'laminate' | 'timber' | 'linoleum';
  finish: 'matte' | 'satin';
  quantity: number;
}

interface Props {
  config: TabletopConfig;
}

const MM_TO_M = 0.001;

const TabletopMesh: React.FC<Props> = ({ config }) => {
  const { shape, lengthMm, widthMm, thicknessMm, edgeRadiusMm } = config;

  const geometry = useMemo(() => {
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
  }, [shape, lengthMm, widthMm, thicknessMm, edgeRadiusMm]);

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

const Configurator3D: React.FC<{ config: TabletopConfig }> = ({ config }) => {
  return (
    <Canvas
      camera={{ position: [1.5, 1.3, 1.5], fov: 40 }}
      shadows
      dpr={[1, 2]}
    >
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <group position={[0, 0, 0]}>
        <TabletopMesh config={config} />
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[5, 5]} />
        <meshStandardMaterial color="#020617" />
      </mesh>
      <OrbitControls enablePan enableRotate enableZoom />
      <Environment preset="warehouse" />
    </Canvas>
  );
};

export default Configurator3D;
