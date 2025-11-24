# Quick Start Guide

## Build with Test Data

Use the new npm scripts to build with test mode enabled:

```bash
# Build once with test data
npm run build:test

# Watch mode with test data (auto-rebuild on changes)
npm run watch:test
```

## Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` directory from this project
5. Extension should appear in your extensions list

## Test the Extension

1. **Click the extension icon** to open popup
2. **Sign In**: Click "Sign In" button (uses mock auth in test mode)
3. **Get Next Payment**: Click "Get Next Payment" (returns mock payment)
4. **View Payment**: See payment summary with test vendor and amounts
5. **Navigate to a website**: Content script will detect portal (or not)

## Available Scripts

- `npm run build` - Production build
- `npm run build:dev` - Development build (test mode auto-enabled)
- `npm run build:test` - Development build with test mode explicitly enabled
- `npm run watch` - Watch mode (auto-rebuild on changes)
- `npm run watch:test` - Watch mode with test data
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

## Test Mode Features

When test mode is enabled (`USE_TEST_DATA=true`):

- ✅ No real API calls - all services return mock data
- ✅ No Chrome identity API needed - mock auth
- ✅ No backend services required
- ✅ Fast iteration - no network delays
- ✅ Safe testing - no real payment data

## Next Steps

1. Test the current implementation
2. Continue with PR5 (Obfuscation Layer)
3. Continue with PR6 (Evidence Capture)

See `TESTING_GUIDE.md` for more detailed testing instructions.

