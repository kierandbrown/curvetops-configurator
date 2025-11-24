import { Timestamp } from 'firebase/firestore';
import { TabletopConfig } from '../configurator/Configurator3D';
import { ParsedCustomOutline } from '../configurator/customShapeTypes';

export interface SelectedColourMeta {
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
}

export interface CartCustomShapeMeta {
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  uploadedAt?: string | null;
  outline?: ParsedCustomOutline | null;
  notes?: string | null;
}

export interface CartLabourCost {
  id?: string;
  label?: string;
  basis?: string;
  appliesToEdgeProfile?: string;
  units?: number;
  rate?: number;
  cost?: number;
}

export interface CartCostingSnapshot {
  areaM2?: number;
  edgeLengthM?: number;
  squareMeterRate?: number;
  sheetAreaM2?: number;
  piecesPerSheet?: number;
  sheetsRequired?: number;
  sheetUnitCost?: number;
  materialCost?: number;
  labourItems?: CartLabourCost[];
  labourTotal?: number;
  baseCost?: number;
  profit?: number;
  profitPercentage?: number;
  totalCost?: number;
  recordedAt?: string;
}

export interface CartItemRecord {
  id: string;
  label: string;
  config: TabletopConfig;
  selectedColour: SelectedColourMeta | null;
  customShape: CartCustomShapeMeta | null;
  estimatedPrice: number | null;
  costing: CartCostingSnapshot | null;
  orderId?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
