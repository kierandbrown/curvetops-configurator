import { Timestamp } from 'firebase/firestore';
import { TabletopConfig } from '../configurator/Configurator3D';
import { CartCostingSnapshot, CartCustomShapeMeta, SelectedColourMeta } from '../cart/types';

export type SpecificationStatus = 'draft' | 'shared' | 'converted';

export interface SpecificationLineItem {
  cartItemId?: string;
  label: string;
  config: TabletopConfig;
  selectedColour: SelectedColourMeta | null;
  customShape: CartCustomShapeMeta | null;
  estimatedPrice: number | null;
  costing: CartCostingSnapshot | null;
}

export interface CartSpecification {
  id: string;
  userId: string;
  jobName: string;
  jobAddress: string;
  buyerName: string;
  buyerCompany: string;
  specifierName: string;
  specifierCompany: string;
  notes: string;
  items: SpecificationLineItem[];
  cartItemCount: number;
  totalEstimatedValue: number;
  status: SpecificationStatus;
  linkedOrderId?: string | null;
  convertedOrderValue?: number | null;
  commissionRate: number;
  commissionDue?: number | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const DEFAULT_COMMISSION_RATE = 0.05;
