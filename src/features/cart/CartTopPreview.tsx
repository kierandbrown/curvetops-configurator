import { useId } from 'react';
import { TabletopConfig } from '../configurator/Configurator3D';

type PreviewSize = 'compact' | 'roomy';

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
  size?: PreviewSize;
}

const MATERIAL_FILL: Record<TabletopConfig['material'], string> = {
  laminate: 'rgba(16,185,129,0.25)',
  timber: 'rgba(245,158,11,0.25)',
  linoleum: 'rgba(59,130,246,0.25)'
};

const DIMENSION_COLOR = '#fcd34d';

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

const PREVIEW_SIZES: Record<PreviewSize, { viewBoxWidth: number; viewBoxHeight: number; frameClass: string }>
  = {
    compact: { viewBoxWidth: 200, viewBoxHeight: 140, frameClass: 'h-24 w-36' },
    roomy: { viewBoxWidth: 320, viewBoxHeight: 180, frameClass: 'h-32 w-full max-w-xl md:h-40 md:max-w-2xl' }
  };

const CartTopPreview = ({ config, label, selectedColour, size = 'compact' }: CartTopPreviewProps) => {
  const { viewBoxWidth, viewBoxHeight, frameClass } = PREVIEW_SIZES[size];
  const padding = 16;
  const clipPadding = 10;
  const swatchPatternId = `${useId()}-swatch`;
  const clipPathId = `${useId()}-plan-clip`;

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

  const dimensionTextProps = {
    fontSize: 11,
    fill: '#fef3c7',
    fontWeight: 600 as const,
    letterSpacing: '0.5px'
  };

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
      <div
        className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/70 shadow-inner shadow-slate-950/70 ${frameClass}`}
      >
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          role="img"
          aria-label={`${label} preview`}
          className="h-full w-full"
        >
          <title>{`${label} preview`}</title>
          <defs>
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
            <clipPath id={clipPathId}>
              <rect
                x={clipPadding}
                y={clipPadding}
                width={viewBoxWidth - clipPadding * 2}
                height={viewBoxHeight - clipPadding * 2}
                rx={8}
              />
            </clipPath>
          </defs>
          <rect
            x={clipPadding}
            y={clipPadding}
            width={viewBoxWidth - clipPadding * 2}
            height={viewBoxHeight - clipPadding * 2}
            rx={8}
            fill="rgba(15,23,42,0.35)"
            stroke="#1e293b"
            strokeWidth={2}
          />
          <g clipPath={`url(#${clipPathId})`}>{shapeElement}</g>
          {/* Plan view dimensions anchored to the scaled shape so buyers see the saved size at a glance. */}
          <g>
            {/* Length dimension */}
            <line
              x1={originX}
              y1={originY - 8}
              x2={originX + scaledLength}
              y2={originY - 8}
              stroke={DIMENSION_COLOR}
              strokeWidth={2}
            />
            <line
              x1={originX}
              y1={originY}
              x2={originX}
              y2={originY - 8}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <line
              x1={originX + scaledLength}
              y1={originY}
              x2={originX + scaledLength}
              y2={originY - 8}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <rect
              x={centerX - 36}
              y={originY - 22}
              rx={4}
              ry={4}
              width={72}
              height={16}
              fill="#0f172a"
              stroke="#c084fc"
              strokeWidth={1}
            />
            <text x={centerX} y={originY - 10} textAnchor="middle" {...dimensionTextProps}>
              {config.lengthMm} mm
            </text>

            {/* Width dimension */}
            <line
              x1={originX + scaledLength + 8}
              y1={originY}
              x2={originX + scaledLength + 8}
              y2={originY + scaledWidth}
              stroke={DIMENSION_COLOR}
              strokeWidth={2}
            />
            <line
              x1={originX + scaledLength}
              y1={originY}
              x2={originX + scaledLength + 8}
              y2={originY}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <line
              x1={originX + scaledLength}
              y1={originY + scaledWidth}
              x2={originX + scaledLength + 8}
              y2={originY + scaledWidth}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <rect
              x={originX + scaledLength - 70}
              y={centerY - 9}
              rx={4}
              ry={4}
              width={70}
              height={18}
              fill="#0f172a"
              stroke="#c084fc"
              strokeWidth={1}
            />
            <text x={originX + scaledLength - 35} y={centerY + 3} textAnchor="middle" {...dimensionTextProps}>
              {config.widthMm} mm
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="text-[0.6rem] uppercase tracking-wide text-slate-500">
        {config.shape.replace('-', ' ')}
      </figcaption>
    </figure>
  );
};

export default CartTopPreview;
