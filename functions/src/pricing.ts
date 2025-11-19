import { onCall } from 'firebase-functions/v2/https';

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

export const calculateTabletopPrice = onCall<TabletopConfig>(
  {
    region: 'australia-southeast1',
    // Enable automatic CORS response headers so local dev (localhost:3001)
    // and production deployments can call this function directly without
    // running into a failed OPTIONS preflight.
    cors: true
  },
  (request) => {
    const {
      lengthMm,
      widthMm,
      thicknessMm,
      material,
      quantity
    } = request.data;

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
  }
);
