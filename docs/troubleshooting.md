# Troubleshooting common runtime errors

## CORS preflight failure when calling `calculateTabletopPrice`

When the frontend calls the Cloud Function at `https://australia-southeast1-curvetops-configurator.cloudfunctions.net/calculateTabletopPrice`, the browser sends an HTTP `OPTIONS` preflight request before the actual `POST` or `GET`. The error:

> Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.

appears when the function's response (or its preflight handler) does not include the `Access-Control-Allow-Origin` header that matches the requesting origin (e.g., `http://localhost:3000`). To resolve this:

- Update the Cloud Function to explicitly set CORS headers for both `OPTIONS` and the main request (using middleware such as `cors` in an Express handler or manual header setting).
- Alternatively, proxy the request through the Vite dev server (configure `server.proxy` in `vite.config.ts`) so the browser sees a same-origin request during local development.

## Firestore composite index required

The Firestore error:

> FirebaseError: [code=failed-precondition]: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/curvetops-configurator/firestore/indexes?create_composite=...

occurs when a query filters or orders on multiple fields without a matching composite index. Use the provided link to auto-populate the index creation form, then build the index in Firestore. Alternatively, adjust the query to avoid the unsupported combination of filters/order clauses if you want to reduce index usage.
