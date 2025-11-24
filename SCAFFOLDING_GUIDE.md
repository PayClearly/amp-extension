# First Commit Scaffolding Steps

## Prerequisites

- Node.js 18+ and npm/yarn
- Chrome browser for testing
- GCP account with project set up
- Pulumi CLI installed (`brew install pulumi` or [pulumi.com/docs/get-started/install](https://www.pulumi.com/docs/get-started/install/))

## Step 1: Install Dependencies

```bash
cd /Users/greg/repos/payclearly/amp-extension
npm install
```

## Step 2: Create Icon Assets

Create placeholder icons (or use actual icons later):

```bash
mkdir -p icons
# Create 16x16, 48x48, 128x128 PNG icons
# For now, you can use placeholder images or skip (extension will work without icons)
```

## Step 3: Set Up Environment Variables

Create `.env` file (or use environment-specific files):

```bash
# .env.dev
AUTH_SERVICE_URL=https://auth.dev.payclearly.com
QUEUE_SERVICE_URL=https://queue-service-xxx.run.app
PAYMENT_SERVICE_URL=https://payments.dev.payclearly.com
PORTAL_LEARNING_SERVICE_URL=https://portal-learning-service-xxx.run.app
EXCEPTION_SERVICE_URL=https://exceptions.dev.payclearly.com
EVIDENCE_SERVICE_URL=https://evidence.dev.payclearly.com
TELEMETRY_SERVICE_URL=https://telemetry-service-xxx.run.app
GCP_PROJECT_ID=payclearly-dev
BIGQUERY_DATASET=payclearly_extension_telemetry
BIGQUERY_TABLE=events
GCS_EVIDENCE_BUCKET=payclearly-evidence-dev
OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
TEMPLATE_SIGNING_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
TEMPLATE_CONFIDENCE_THRESHOLD_DEFAULT=0.7
```

## Step 4: Build Extension

```bash
npm run build:dev
```

This creates the `dist/` directory with:
- `background/background.js`
- `content/content.js`
- `popup/popup.html` and `popup/popup.js`
- `manifest.json`

## Step 5: Load Extension in Chrome (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` directory
5. Extension should appear in your extensions list

## Step 6: Test Basic Functionality

1. Click the extension icon to open popup
2. Verify popup UI loads
3. Check browser console for any errors
4. Check extension service worker console (click "service worker" link in chrome://extensions/)

## Step 7: Set Up Pulumi Infrastructure

```bash
cd infra
pulumi stack init dev
pulumi config set gcp:project payclearly-dev
pulumi config set gcp:region us-central1

# Set service URLs (see PULUMI_PLAN.md for full config)
pulumi config set payclearly-extension-infra:authServiceUrl https://auth.dev.payclearly.com
# ... etc
```

## Step 8: Deploy Backend Services (After Implementation)

```bash
# Build and push Docker images first
# Then deploy with Pulumi
cd infra/queue-service
pulumi up

cd ../portal-learning-service
pulumi up

cd ../telemetry
pulumi up
```

## Step 9: Development Workflow

### Watch Mode (Auto-rebuild)
```bash
npm run watch
```

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Formatting
```bash
npm run format
```

## Step 10: Testing

Create test files in `tests/` directory:

```bash
mkdir -p tests
# Add Jest test files
```

Run tests:
```bash
npm test
```

## Next Steps

1. **Implement Backend Services**: See `BACKEND_PLAN.md` for Queue Passthrough and Portal Learning services
2. **Complete Portal Detection**: Implement URL pattern matching and DOM fingerprinting in `src/content/portalDetect.ts`
3. **Add Template Signing**: Implement RSA signature verification in `src/shared/selectors.ts`
4. **Implement BigQuery Telemetry**: Add direct BigQuery client if not using HTTP service
5. **Add Error Recovery**: Implement retry logic and error state handling
6. **Create Icons**: Design and add extension icons
7. **Write Tests**: Add unit and integration tests

## File Structure Summary

```
amp-extension/
├── src/
│   ├── background/          # Service worker
│   │   ├── index.ts
│   │   ├── auth.ts
│   │   ├── stateMachine.ts
│   │   ├── evidence.ts
│   │   └── telemetry.ts
│   ├── content/              # Content scripts
│   │   ├── index.ts
│   │   ├── portalDetect.ts
│   │   ├── formDetect.ts
│   │   ├── autofill.ts
│   │   ├── learning.ts
│   │   ├── obfuscate.ts
│   │   └── scrape.ts
│   ├── popup/                # React popup UI
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── state/
│   │   └── styles.css
│   └── shared/               # Shared utilities
│       ├── types.ts
│       ├── schemas.ts
│       ├── config.ts
│       ├── logger.ts
│       ├── apiClient.ts
│       ├── events.ts
│       └── selectors.ts
├── infra/                    # Pulumi infrastructure
│   ├── queue-service/
│   ├── portal-learning-service/
│   └── telemetry/
├── manifest.json
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## Common Issues

### Extension Not Loading
- Check `manifest.json` syntax
- Verify all entry points exist in `dist/`
- Check browser console for errors

### Service Worker Not Starting
- Check `background/index.ts` for syntax errors
- Verify service worker is registered in manifest
- Check "service worker" console in chrome://extensions/

### Content Script Not Injecting
- Verify `host_permissions` in manifest
- Check content script matches URL patterns
- Verify content script file exists in `dist/content/`

### Build Errors
- Run `npm run type-check` to see TypeScript errors
- Check `webpack.config.js` for configuration issues
- Verify all dependencies installed

## Environment-Specific Builds

For production builds, use environment-specific config:

```bash
# Build for staging
NODE_ENV=staging npm run build

# Build for production
NODE_ENV=production npm run build
```

Update `webpack.config.js` to read from environment-specific `.env` files if needed.

