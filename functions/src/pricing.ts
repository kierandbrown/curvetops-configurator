import * as functions from 'firebase-functions';

interface TabletopConfig {
  shape: 'rect' | 'rounded-rect' | 'ellipse' | 'super-ellipse' | 'custom';
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  edgeRadiusMm: number;
  superEllipseExponent: number;
  material: 'laminate' | 'timber' | 'linoleum';
  finish: 'matte' | 'satin';
  quantity: number;
}

export const calculateTabletopPrice = functions
  .region('australia-southeast1')
  .https.onCall((data: TabletopConfig, context) => {
    const {
      lengthMm,
      widthMm,
      thicknessMm,
      material,
      quantity
    } = data;

    const areaM2 = (lengthMm / 1000) * (widthMm / 1000);
    const thicknessFactor = thicknessMm / 25;

    let baseRatePerM2 = 250;
    if (material === 'timber') baseRatePerM2 = 380;
    if (material === 'linoleum') baseRatePerM2 = 320;

    let unitPrice = areaM2 * baseRatePerM2 * thicknessFactor;

    if (quantity >= 5 && quantity < 10) unitPrice *= 0.97;
    if (quantity >= 10) unitPrice *= 0.94;

    const total = unitPrice * quantity;

    return {
      price: Math.round(total),
      currency: 'AUD',
      areaM2,
      material
    };
  });
