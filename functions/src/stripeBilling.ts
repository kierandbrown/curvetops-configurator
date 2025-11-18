import * as functions from 'firebase-functions';
import Stripe from 'stripe';

const stripe = new Stripe(functions.params.STRIPE_SECRET_KEY.value(), {
  apiVersion: '2024-06-20'
});

export const createCheckoutSession = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in first');
    }

    const { amount, currency = 'aud', returnUrl } = data;

    if (!amount || amount <= 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Amount must be > 0'
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: 'Custom tabletop'
            }
          }
        }
      ],
      success_url: returnUrl || 'https://your-domain/success',
      cancel_url: returnUrl || 'https://your-domain/cancel',
      metadata: {
        uid: context.auth.uid
      }
    });

    return {
      id: session.id,
      url: session.url
    };
  });
