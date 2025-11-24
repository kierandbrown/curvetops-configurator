import { TabletopConfig } from './Configurator3D';

export const defaultTabletopConfig: TabletopConfig = {
  shape: 'rounded-rect',
  lengthMm: 2000,
  widthMm: 900,
  leftReturnMm: 800,
  rightReturnMm: 800,
  internalRadiusMm: 60,
  externalRadiusMm: 80,
  thicknessMm: 25,
  edgeRadiusMm: 150,
  superEllipseExponent: 2.5,
  roundFrontCorners: true,
  includeCableContour: false,
  cableContourLengthMm: 400,
  cableContourDepthMm: 60,
  workstationFrontRadiusMm: 120,
  material: 'laminate',
  finish: 'matte',
  // Default to the edged profile so pricing + renders match the majority of jobs.
  edgeProfile: 'edged',
  quantity: 1
};
