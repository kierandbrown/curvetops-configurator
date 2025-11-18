// Basic point representation used when we rebuild the outline from DXF data.
export interface OutlinePoint {
  x: number;
  y: number;
}

// Bounding box metadata helps with scaling previews and recentring the mesh.
export interface OutlineBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Parsed outline is a list of closed paths (outer perimeter + optional cutouts).
export interface ParsedCustomOutline {
  paths: OutlinePoint[][];
  bounds: OutlineBounds | null;
}

// Metadata saved in React state so we can show upload details + previews.
export interface CustomShapeDetails {
  fileName: string;
  fileSize: number;
  fileType: 'dxf' | 'dwg';
  uploadedAt: string;
  outline: ParsedCustomOutline | null;
  notes?: string;
}
