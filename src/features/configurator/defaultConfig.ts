import { TabletopConfig } from './Configurator3D';

export const defaultTabletopConfig: TabletopConfig = {
  shape: 'rounded-rect',
  lengthMm: 2000,
  widthMm: 900,
  thicknessMm: 25,
  edgeRadiusMm: 150,
  superEllipseExponent: 2.5,
  material: 'laminate',
  finish: 'matte',
  // Default to the edged profile so pricing + renders match the majority of jobs.
  edgeProfile: 'edged',
  quantity: 1
};
