# Testing Guide

## Test Mode

The extension supports a test mode that uses mock data instead of real API calls. This allows you to test the extension UI and flow without requiring backend services to be running.

## Enabling Test Mode

### Option 1: Environment Variable (Recommended)

Set `USE_TEST_DATA=true` when building:

```bash
USE_TEST_DATA=true npm run build:dev
```

### Option 2: Development Mode (Auto-enabled)

Test mode is automatically enabled when `NODE_ENV=development`:

```bash
npm run build:dev
```

### Option 3: Manual Toggle in Code

Edit `src/shared/config.ts` and set `USE_TEST_DATA` to `true`:

```typescript
const USE_TEST_DATA = true; // Force test mode
```

## What Test Mode Does

When test mode is enabled:

1. **Authentication**: Returns mock tokens without calling Chrome identity API
2. **Queue Service**: Returns a mock payment (`pay_test_123`)
3. **Payment Service**: Returns mock payment data
4. **Portal Learning Service**: Returns mock template or null (simulates learning mode)
5. **Exception Service**: Simulates exception creation
6. **Evidence Service**: Simulates screenshot upload (no actual capture)
7. **Telemetry**: Logs to console instead of sending to BigQuery

## Test Data

Mock data is defined in `src/shared/testData.ts`:

- **Mock Payment**: Test vendor, $1234.56, test invoice numbers
- **Mock Template**: Payment form template with 5 fields (amount, invoice, card, expiry, CVV)
- **Mock Tokens**: Test access/refresh tokens
- **Mock Presigned URL**: Test GCS upload URL

## Testing Scenarios

### 1. Authentication Flow

1. Load extension in Chrome
2. Click extension icon
3. Click "Sign In" button
4. Should authenticate immediately (test mode)
5. Popup should show main UI

### 2. Payment Fetching

1. Click "Get Next Payment" button
2. Should fetch mock payment after ~500ms delay
3. Payment summary should display:
   - Vendor: "Test Vendor Corp"
   - Amount: $1,234.56
   - Invoices: INV-TEST-001, INV-TEST-002

### 3. Portal Detection

1. Navigate to any website
2. Content script should detect portal (or not)
3. Check browser console for portal detection logs

### 4. Autofill (with Template)

1. Fetch payment (step 2)
2. Navigate to a page with a form
3. If template matches mock data, autofill should trigger
4. Form fields should be filled with payment data

### 5. Learning Mode (no Template)

1. Fetch payment
2. Navigate to a page with a form
3. If no template exists, learning mode should activate
4. Fill form manually
5. Submit form
6. Template should be "learned" and stored

### 6. Evidence Capture

1. Complete payment flow
2. Navigate to confirmation page
3. Screenshot should be "captured" (simulated in test mode)
4. Evidence should be "uploaded" (simulated)
5. Check console for upload logs

## Console Logging

In test mode, all API calls are logged to the console with `[TEST DATA]` prefix:

```
[INFO] Using test data for queue service
[INFO] Using test data for payment service
```

## Switching Between Test and Real Mode

To test with real services:

1. Set `USE_TEST_DATA=false` or remove the env var
2. Ensure all service URLs are configured in `.env`
3. Rebuild: `npm run build:dev`
4. Load extension in Chrome

## TODO Markers

Look for `TODO:` comments in the code to find places where:

- Real API integration is needed
- Test data mocks should be removed
- Additional implementation is required

Key files with TODOs:
- `src/shared/apiClient.ts` - All service methods
- `src/background/auth.ts` - Auth flow
- `src/background/evidence.ts` - Screenshot capture
- `src/content/portalDetect.ts` - Portal detection
- `src/content/formDetect.ts` - Form detection

## Debugging

### Check Test Mode Status

Open extension popup and check browser console:

```javascript
// In background service worker console
console.log(config.useTestData); // Should be true in test mode
```

### View Mock Data

Mock data is exported from `src/shared/testData.ts`:

```typescript
import { MOCK_PAYMENT, MOCK_PORTAL_TEMPLATE } from './shared/testData';
```

### Network Tab

In test mode, you won't see real network requests. All calls are mocked locally.

## Limitations of Test Mode

1. **No Real Screenshots**: Screenshot capture is simulated
2. **No Real Uploads**: GCS upload is simulated
3. **No Real Auth**: Chrome identity API is bypassed
4. **Fixed Data**: Always returns same mock payment/template
5. **No Persistence**: Templates "learned" in test mode aren't persisted

## Next Steps

When ready to test with real services:

1. Deploy backend services (Queue, Portal Learning, Evidence, etc.)
2. Configure service URLs in `.env`
3. Set `USE_TEST_DATA=false`
4. Rebuild and test

