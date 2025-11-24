import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@auth/firebase';
import { TabletopConfig } from './Configurator3D';

interface PriceResponse {
  price: number;
}

// Re-use the same pricing logic from the Cloud Function so we can show an
// instant estimate and fall back to it if the callable request fails (CORS,
// offline usage, etc.). Keeping the logic here ensures the UI still works even
// when remote pricing is temporarily unavailable.
const calculateLocalPrice = (config: TabletopConfig): PriceResponse => {
  const {
    lengthMm,
    widthMm,
    thicknessMm,
    material,
    quantity
  } = config;

  const areaM2 = (lengthMm / 1000) * (widthMm / 1000);
  const thicknessFactor = thicknessMm / 25;

  let baseRatePerM2 = 250;
  if (material === 'timber') baseRatePerM2 = 380;
  if (material === 'linoleum') baseRatePerM2 = 320;

  let unitPrice = areaM2 * baseRatePerM2 * thicknessFactor;

  if (quantity >= 5 && quantity < 10) unitPrice *= 0.97;
  if (quantity >= 10) unitPrice *= 0.94;

  const total = unitPrice * quantity;

  return { price: Math.round(total) };
};

export const usePricing = (config: TabletopConfig) => {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoise the payload so we only re-trigger the effect when a meaningful
  // change occurs (avoids extra calls caused by new object references).
  const normalizedPayload = useMemo(
    () => ({
      shape: config.shape,
      lengthMm: Number(config.lengthMm),
      widthMm: Number(config.widthMm),
      leftReturnMm: Number(config.leftReturnMm),
      rightReturnMm: Number(config.rightReturnMm),
      internalRadiusMm: Number(config.internalRadiusMm),
      externalRadiusMm: Number(config.externalRadiusMm),
      thicknessMm: Number(config.thicknessMm),
      edgeRadiusMm: Number(config.edgeRadiusMm),
      superEllipseExponent: Number(config.superEllipseExponent),
      roundFrontCorners: config.roundFrontCorners,
      includeCableContour: config.includeCableContour,
      cableContourLengthMm: Number(config.cableContourLengthMm),
      cableContourDepthMm: Number(config.cableContourDepthMm),
      workstationFrontRadiusMm: Number(config.workstationFrontRadiusMm),
      material: config.material,
      finish: config.finish,
      edgeProfile: config.edgeProfile,
      quantity: Number(config.quantity)
    }),
    [
      config.shape,
      config.lengthMm,
      config.widthMm,
      config.leftReturnMm,
      config.rightReturnMm,
      config.internalRadiusMm,
      config.externalRadiusMm,
      config.thicknessMm,
      config.edgeRadiusMm,
      config.superEllipseExponent,
      config.roundFrontCorners,
      config.includeCableContour,
      config.cableContourLengthMm,
      config.cableContourDepthMm,
      config.workstationFrontRadiusMm,
      config.material,
      config.finish,
      config.edgeProfile,
      config.quantity
    ]
  );

  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      // Always show an instantaneous local estimate so the UI remains
      // responsive even before we hit the network.
      const localEstimate = calculateLocalPrice(normalizedPayload);
      if (!cancelled) {
        setPrice(localEstimate.price);
      }

      setLoading(true);
      setError(null);
      try {
        const callable = httpsCallable<any, PriceResponse>(
          functions,
          'calculateTabletopPrice'
        );
        const res = await callable(normalizedPayload as any);
        if (!cancelled) {
          setPrice(res.data.price);
        }
      } catch (err: any) {
        if (!cancelled) {
          // Preserve the local estimate but surface that the networked
          // calculation failed so the operator can retry/reload.
          setError(
            err.message ??
              'We were unable to verify the latest price. Showing a local estimate instead.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const id = setTimeout(fetchPrice, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [normalizedPayload]);

  return { price, loading, error };
};
