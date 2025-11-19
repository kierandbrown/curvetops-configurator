import { TabletopConfig } from '../configurator/Configurator3D';

export interface CartCustomShapeMeta {
  fileName?: string | null;
  notes?: string | null;
}

export const buildCartSearchKeywords = (
  config: TabletopConfig,
  materialLabel: string,
  customShape: CartCustomShapeMeta | null
): string[] => {
  const rawTerms = [
    'cart',
    'top',
    config.shape,
    config.material,
    config.finish,
    `${config.lengthMm}x${config.widthMm}`,
    `${config.thicknessMm}mm`,
    `qty ${config.quantity}`,
    materialLabel,
    customShape?.fileName ?? '',
    customShape?.notes ?? ''
  ];

  return Array.from(
    new Set(
      rawTerms
        .filter(Boolean)
        .flatMap(term =>
          term
            .toString()
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean)
        )
    )
  );
};
