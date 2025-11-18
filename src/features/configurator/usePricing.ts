import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@auth/firebase';
import { TabletopConfig } from './Configurator3D';

interface PriceResponse {
  price: number;
}

export const usePricing = (config: TabletopConfig) => {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      setLoading(true);
      setError(null);
      try {
        const callable = httpsCallable<any, PriceResponse>(
          functions,
          'calculateTabletopPrice'
        );
        const res = await callable(config as any);
        if (!cancelled) {
          setPrice(res.data.price);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? 'Pricing failed');
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
  }, [config]);

  return { price, loading, error };
};
