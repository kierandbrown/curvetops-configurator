import { TabletopConfig } from '../configurator/Configurator3D';

export interface CartCustomShapeMeta {
  fileName?: string | null;
  notes?: string | null;
}

export const buildCartSearchKeywords = (
  config: TabletopConfig,
  materialLabel: string,
  customShape: CartCustomShapeMeta | null,
  label?: string,
  extraTerms: string[] = []
): string[] => {
  // Edge profile keywords make it easier to search for "sharknose" or "ABS" jobs later.
  const edgeProfileKeywords: Record<TabletopConfig['edgeProfile'], string[]> = {
    edged: ['edged', 'abs', 'square-edge'],
    'painted-sharknose': ['painted', 'sharknose', 'bevel']
  };

  const rawTerms = [
    'cart',
    'top',
    config.shape,
    config.material,
    config.finish,
    `${config.lengthMm}x${config.widthMm}`,
    `${config.thicknessMm}mm`,
    `qty ${config.quantity}`,
    config.edgeProfile,
    ...edgeProfileKeywords[config.edgeProfile],
    materialLabel,
    label ?? '',
    customShape?.fileName ?? '',
    customShape?.notes ?? '',
    ...extraTerms
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
