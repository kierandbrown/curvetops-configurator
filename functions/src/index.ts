import * as admin from 'firebase-admin';
import { calculateTabletopPrice } from './pricing';
import { createCheckoutSession } from './stripeBilling';

if (!admin.apps.length) {
  admin.initializeApp();
}

export { calculateTabletopPrice, createCheckoutSession };
