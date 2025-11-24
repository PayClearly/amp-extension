# Test Mode Setup

## Quick Start

1. **Enable test mode** (one of these methods):
   ```bash
   # Option 1: Environment variable
   USE_TEST_DATA=true npm run build:dev

   # Option 2: Development mode (auto-enabled)
   npm run build:dev
   ```

2. **Load extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` directory

3. **Test the extension**:
   - Click extension icon
   - Click "Sign In" (uses mock auth)
   - Click "Get Next Payment" (returns mock payment)
   - Navigate to any website to test portal detection

## What's Mocked

All services return mock data when `USE_TEST_DATA=true`:

- ✅ Authentication (no Chrome identity API needed)
- ✅ Queue Service (returns test payment)
- ✅ Payment Service (returns test payment data)
- ✅ Portal Learning Service (returns test template or null)
- ✅ Exception Service (simulates exception creation)
- ✅ Evidence Service (simulates screenshot upload)
- ✅ Telemetry (logs to console)

## Test Data

See `src/shared/testData.ts` for all mock data:
- Mock Payment: `pay_test_123` with test vendor and amounts
- Mock Template: Payment form with 5 fields
- Mock Tokens: Test access/refresh tokens

## TODO Comments

Look for `TODO:` comments throughout the codebase to find:
- Places where real API integration is needed
- Test data mocks that should be removed
- Additional implementation required

Key files with TODOs:
- `src/shared/apiClient.ts` - All service methods
- `src/background/auth.ts` - Auth flow
- `src/background/evidence.ts` - Screenshot capture
- `src/content/portalDetect.ts` - Portal detection
- `src/content/formDetect.ts` - Form detection
- `src/content/scrape.ts` - Metadata scraping

## Switching to Real Services

When ready to test with real services:

1. Set `USE_TEST_DATA=false` or remove env var
2. Configure service URLs (see `.env.example`)
3. Rebuild: `npm run build:dev`
4. Load extension

## Console Logging

In test mode, all API calls are logged:
```
[INFO] Using test data for queue service
[INFO] Using test data for payment service
```

Check browser console (background service worker) for logs.

