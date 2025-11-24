# Firebase Hosting Deployment

Use these steps to deploy the app to the `curvetops-configurator-bbeb7` Hosting site.

1. Install dependencies and build the production bundle:
   ```bash
   npm install
   npm run build
   ```

2. Ensure the Firebase CLI is authenticated and targeting the correct project/site:
   ```bash
   firebase login
   firebase use curvetops-configurator
   # Optional: confirm the hosting target maps to the site ID
   firebase target:apply hosting curvetops-configurator-bbeb7 curvetops-configurator-bbeb7
   ```

3. Deploy only Hosting (uses the `predeploy` build step and the target defined in `.firebaserc`):
   ```bash
   firebase deploy --only hosting
   ```

The `firebase.json` already points Hosting to the `dist` folder and rewrites all routes to `/index.html` for SPA routing.
