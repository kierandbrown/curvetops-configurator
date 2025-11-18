import { OutlineBounds, OutlinePoint, ParsedCustomOutline } from './customShapeTypes';

/**
 * Parses a small subset of the DXF spec so we can extract closed polylines that
 * describe the custom tabletop outline. We intentionally keep the parser very
 * small because we only need LWPOLYLINE + LINE entities for now.
 */
export const parseDxfOutline = (content: string): ParsedCustomOutline => {
  const lines = content.split(/\r?\n/);
  let cursor = 0;
  let currentEntity: 'LINE' | 'LWPOLYLINE' | null = null;
  let pendingX: number | null = null;
  const outlines: OutlinePoint[][] = [];
  let currentPolyline: OutlinePoint[] = [];
  let currentLine: OutlinePoint[] = [];
  let currentFlags = 0;

  const flushEntity = () => {
    if (currentEntity === 'LWPOLYLINE' && currentPolyline.length) {
      const closed = (currentFlags & 1) === 1;
      const completed = [...currentPolyline];
      if (closed && completed.length) {
        completed.push({ ...completed[0] });
      }
      outlines.push(completed);
    }
    if (currentEntity === 'LINE' && currentLine.length === 2) {
      outlines.push([...currentLine]);
    }
    currentPolyline = [];
    currentLine = [];
    currentEntity = null;
    pendingX = null;
    currentFlags = 0;
  };

  while (cursor < lines.length - 1) {
    const code = lines[cursor]?.trim();
    const valueRaw = lines[cursor + 1];
    cursor += 2;
    const value = valueRaw?.trim();

    if (code === '0') {
      if (currentEntity) {
        flushEntity();
      }
      if (value === 'LWPOLYLINE' || value === 'LINE') {
        currentEntity = value;
      } else {
        currentEntity = null;
      }
      continue;
    }

    if (!currentEntity) continue;

    if (currentEntity === 'LWPOLYLINE') {
      if (code === '70') {
        currentFlags = Number(value);
      }
      if (code === '10') {
        pendingX = Number(value);
      }
      if (code === '20' && pendingX != null) {
        currentPolyline.push({ x: pendingX, y: Number(value) });
        pendingX = null;
      }
    }

    if (currentEntity === 'LINE') {
      if (code === '10') {
        currentLine[0] = currentLine[0] ?? { x: 0, y: 0 };
        currentLine[0].x = Number(value);
      }
      if (code === '20') {
        currentLine[0] = currentLine[0] ?? { x: 0, y: 0 };
        currentLine[0].y = Number(value);
      }
      if (code === '11') {
        currentLine[1] = currentLine[1] ?? { x: 0, y: 0 };
        currentLine[1].x = Number(value);
      }
      if (code === '21') {
        currentLine[1] = currentLine[1] ?? { x: 0, y: 0 };
        currentLine[1].y = Number(value);
      }
    }
  }

  flushEntity();

  const bounds = calculateBounds(outlines);

  return {
    paths: outlines,
    bounds
  };
};

const calculateBounds = (paths: OutlinePoint[][]): OutlineBounds | null => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  paths.forEach(path => {
    path.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });

  if (!paths.length || !isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};
