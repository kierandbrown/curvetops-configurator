import cors from 'cors';
import * as functions from 'firebase-functions';

const corsHandler = cors({ origin: true, methods: ['GET', 'OPTIONS'] });

export const storageProxy = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    // Explicitly vary on Origin so CDN/proxy caches don't leak responses between tenants.
    res.set('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const target = req.query.target;

    if (typeof target !== 'string' || !target) {
      res.status(400).send('Missing target query parameter.');
      return;
    }

    try {
      const response = await fetch(target);

      if (!response.ok) {
        res.status(response.status).send(`Upstream request failed with ${response.status}.`);
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.set('Content-Type', contentType);
      }

      res.status(200).send(buffer);
    } catch (error) {
      console.error('Storage proxy failed', error);
      res.status(502).send('Unable to fetch requested asset.');
    }
  });
});
