import { useId } from 'react';
import { TabletopConfig } from '../configurator/Configurator3D';

interface CartTopPreviewProps {
  config: TabletopConfig;
  label: string;
  selectedColour: {
    id?: string;
    name?: string;
    materialType?: string;
    finish?: string;
    supplierSku?: string;
    hexCode?: string | null;
    imageUrl?: string | null;
    maxLength?: number | null;
    maxWidth?: number | null;
    availableThicknesses?: number[] | null;
  } | null;
}

const MATERIAL_FILL: Record<TabletopConfig['material'], string> = {
  laminate: 'rgba(16,185,129,0.25)',
  timber: 'rgba(245,158,11,0.25)',
  linoleum: 'rgba(59,130,246,0.25)'
};

// Convert a standard super ellipse formula to an SVG path so the 2D preview
// mirrors the designer-friendly sliders that exist inside the configurator UI.
const buildSuperEllipsePath = (
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  exponent: number
) => {
  const segments = 72;
  const a = width / 2;
  const b = height / 2;
  let path = '';

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x = centerX + a * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent);
    const y = centerY + b * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent);
    path += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
  }

  return `${path} Z`;
};

const toAlphaHex = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  if (![3, 6].includes(sanitized.length)) return null;

  const fullHex = sanitized.length === 3 ? sanitized.split('').map(char => char + char).join('') : sanitized;
  const [r, g, b] = [0, 2, 4].map(index => parseInt(fullHex.slice(index, index + 2), 16));

  const safeAlpha = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${r},${g},${b},${safeAlpha})`;
};

const CartTopPreview = ({ config, label, selectedColour }: CartTopPreviewProps) => {
  const viewBoxWidth = 200;
  const viewBoxHeight = 140;
  const padding = 16;
  const patternId = useId();
  const swatchPatternId = `${patternId}-swatch`;

  const safeLength = Math.max(config.lengthMm, 1);
  const safeWidth = Math.max(config.widthMm, 1);
  const scale = Math.min(
    (viewBoxWidth - padding * 2) / safeLength,
    (viewBoxHeight - padding * 2) / safeWidth
  );

  const scaledLength = safeLength * scale;
  const scaledWidth = safeWidth * scale;
  const originX = (viewBoxWidth - scaledLength) / 2;
  const originY = (viewBoxHeight - scaledWidth) / 2;
  const centerX = viewBoxWidth / 2;
  const centerY = viewBoxHeight / 2;

  const selectedHex = selectedColour?.hexCode?.trim();
  const fillFromHex = selectedHex ? toAlphaHex(selectedHex, 0.35) ?? selectedHex : null;
  const fill = selectedColour?.imageUrl ? `url(#${swatchPatternId})` : fillFromHex ?? MATERIAL_FILL[config.material];

  // Keep the outline neutral so the cart preview is always legible regardless of the chosen material colour.
  const stroke = '#000000';

  let shapeElement: JSX.Element;

  switch (config.shape) {
    case 'rect':
    case 'rounded-rect': {
      const radius =
        config.shape === 'rounded-rect'
          ? Math.min(config.edgeRadiusMm * scale, scaledWidth / 2)
          : 4;
      shapeElement = (
        <rect
          x={originX}
          y={originY}
          width={scaledLength}
          height={scaledWidth}
          rx={radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={4}
        />
      );
      break;
    }
    case 'round-top': {
      const radius = scaledWidth / 2;
      const straightSection = Math.max(scaledLength - radius, 0);
      const startX = originX;
      const startY = originY;
      const endY = originY + scaledWidth;
      const path = `M${startX} ${startY} H${startX + straightSection} A${radius} ${radius} 0 0 1 ${startX + straightSection} ${endY} H${startX} Z`;
      shapeElement = <path d={path} fill={fill} stroke={stroke} strokeWidth={4} />;
      break;
    }
    case 'round': {
      const diameter = Math.min(scaledLength, scaledWidth);
      const radius = diameter / 2;
      shapeElement = (
        <circle cx={centerX} cy={centerY} r={radius} fill={fill} stroke={stroke} strokeWidth={4} />
      );
      break;
    }
    case 'ellipse': {
      shapeElement = (
        <ellipse
          cx={centerX}
          cy={centerY}
          rx={scaledLength / 2}
          ry={scaledWidth / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={4}
        />
      );
      break;
    }
    case 'super-ellipse': {
      const exponent = Math.min(Math.max(config.superEllipseExponent, 1.5), 8);
      const path = buildSuperEllipsePath(scaledLength, scaledWidth, centerX, centerY, exponent);
      shapeElement = <path d={path} fill={fill} stroke={stroke} strokeWidth={4} />;
      break;
    }
    case 'custom':
    default: {
      shapeElement = (
        <>
          <rect
            x={originX}
            y={originY}
            width={scaledLength}
            height={scaledWidth}
            fill="rgba(15,23,42,0.4)"
            stroke={stroke}
            strokeDasharray="8 6"
            strokeWidth={3}
          />
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={20}
            fill={stroke}
            className="uppercase"
          >
            DXF
          </text>
        </>
      );
      break;
    }
  }

  return (
    <figure className="flex flex-col items-center gap-2 text-center">
      <div className="flex h-24 w-36 items-center justify-center rounded-xl border border-black bg-white">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          role="img"
          aria-label={`${label} preview`}
          className="h-full w-full"
        >
          <title>{`${label} preview`}</title>
          {/* A faint grid helps communicate proportions on both mobile and desktop. */}
          <defs>
            <pattern id={`${patternId}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0 H0 V20" fill="none" stroke="rgba(15,23,42,0.4)" strokeWidth={1} />
            </pattern>
            {selectedColour?.imageUrl && (
              <pattern id={swatchPatternId} width="40" height="40" patternUnits="userSpaceOnUse">
                {/* Use the supplier swatch image so the preview colour matches the cart selection. */}
                <image
                  href={selectedColour.imageUrl}
                  x="0"
                  y="0"
                  width="40"
                  height="40"
                  preserveAspectRatio="xMidYMid slice"
                />
              </pattern>
            )}
          </defs>
          <rect width={viewBoxWidth} height={viewBoxHeight} fill={`url(#${patternId}-grid)`} />
          {shapeElement}
        </svg>
      </div>
      <figcaption className="text-[0.6rem] uppercase tracking-wide text-slate-500">
        {config.shape.replace('-', ' ')}
      </figcaption>
    </figure>
  );
};

export default CartTopPreview;
