# PR Sequence: PayClearly Chrome Extension

This document maps the implementation to the PR structure provided, with exact file lists and acceptance criteria.

## PR0 — Repo + Tooling Skeleton

**Scope**: Create `/extension` repo structure (Manifest V3), TS strict config, ESLint + Prettier, test runner, shared types/events folders, basic build scripts (dev + prod).

**Files**:
- `manifest.json` (stub)
- `package.json` (dependencies, scripts)
- `tsconfig.json` (strict TypeScript config)
- `.eslintrc.json` (ESLint config)
- `.prettierrc` (Prettier config)
- `webpack.config.js` (build configuration)
- `src/shared/types.ts` (core type definitions)
- `src/shared/schemas.ts` (Zod schemas)
- `src/shared/events.ts` (event types, notification catalog)
- `src/shared/logger.ts` (logging utility)
- `src/shared/config.ts` (environment configuration)
- `src/popup/index.html` (empty popup HTML)
- `src/popup/index.tsx` (React entry point)
- `src/popup/App.tsx` (empty App component)
- `src/popup/styles.css` (basic styles)
- `src/background/index.ts` (service worker stub)
- `src/content/index.ts` (content script stub)
- `tests/` (test harness setup - Jest config)
- `.gitignore`

**Acceptance**:
- ✅ `npm install` succeeds
- ✅ `npm run lint` passes (no errors)
- ✅ `npm run type-check` passes
- ✅ `npm run build:dev` creates `dist/` with all entry points
- ✅ Chrome loads unpacked extension (no errors in console)
- ✅ Empty popup displays when clicking extension icon

**Test Requirements**:
- Unit test: Type definitions compile
- Integration test: Extension loads in Chrome

---

## PR1 — Auth + Session Bootstrapping

**Scope**: Implement auth flow in background worker, token refresh, logout on failure, popup "Sign in" + session status.

**Files**:
- `src/background/auth.ts` (OAuth flow, token refresh, token storage)
- `src/background/index.ts` (auth message handlers)
- `src/shared/apiClient.ts` (HTTP client with token injection)
- `src/popup/App.tsx` (sign-in UI, session status)
- `src/popup/components/AuthPrompt.tsx` (new component)
- `src/shared/schemas.ts` (extend with TokenResponse schema)

**Acceptance**:
- ✅ Operator can sign in via Chrome identity API
- ✅ Token exchanged with backend `/api/v1/auth/exchange`
- ✅ Access token stored in memory, refresh token in encrypted chrome.storage.local
- ✅ Token refresh works (15min before expiry)
- ✅ Invalid refresh token forces re-authentication
- ✅ Popup shows "Sign In" when not authenticated
- ✅ Popup shows session status when authenticated
- ✅ Telemetry emits `AUTH_SUCCESS` / `AUTH_FAIL` events

**Test Requirements**:
- Unit test: Token refresh logic (mock API calls)
- Integration test: Full auth flow in Chrome (manual)
- E2E test: Sign in → token stored → refresh works

---

## PR2 — Queue Fetch + Active Session State Machine

**Scope**: Background state machine: IDLE → FETCHING → ACTIVE, queue passthrough endpoint integration, "Start Making Payments" and "Stop After Next Payment".

**Files**:
- `src/background/stateMachine.ts` (state machine implementation)
- `src/background/queue.ts` (queue service integration)
- `src/shared/types.ts` (extend with StateContext, ExtensionState)
- `src/shared/schemas.ts` (extend with PaymentSchema)
- `src/popup/state/useExtensionState.ts` (React state hook)
- `src/popup/components/Controls.tsx` (Start/Stop buttons)
- `src/popup/components/PaymentSummary.tsx` (payment display)

**Acceptance**:
- ✅ State machine: IDLE → FETCHING → ACTIVE transitions work
- ✅ "Get Next Payment" button triggers queue fetch
- ✅ Long-poll queue service (30s timeout, handles 204)
- ✅ Payment payload parsed and stored in chrome.storage.session
- ✅ Popup displays payment summary (vendor, amount, invoices)
- ✅ "Stop After Next Payment" toggle works
- ✅ Retry logic: 3 retries with exponential backoff + jitter
- ✅ Error handling: Failed fetch shows error notification
- ✅ State persists across service worker restarts

**Test Requirements**:
- Unit test: State machine transitions
- Unit test: Queue fetch with retry logic (mock API)
- Integration test: Fetch payment → display in popup
- E2E test: Start → fetch → display → stop

---

## PR3 — Portal Detection + Content Script Injection

**Scope**: Host permissions strategy, detect portal + pageKey from URL/DOM fingerprint, emit notifications to popup.

**Files**:
- `src/content/portalDetect.ts` (URL patterns, DOM fingerprinting)
- `src/content/index.ts` (SPA navigation detection, message handling)
- `src/content/notifications.ts` (notification emission to background)
- `src/shared/events.ts` (extend with portal events)
- `manifest.json` (host_permissions: `<all_urls>`)

**Acceptance**:
- ✅ Content script injects on all pages (via manifest)
- ✅ Portal detection: URL pattern matching works
- ✅ Portal detection: DOM fingerprinting works (basic implementation)
- ✅ Portal detection: Confidence scoring (0-1)
- ✅ SPA navigation: Detects URL changes (popstate, pushState)
- ✅ SPA navigation: Re-runs portal detection on navigation
- ✅ Emits `PORTAL_DETECTED` message to background
- ✅ Background stores portalId, pageKey in state
- ✅ Notification: `AUTO_ACTION_IN_PROGRESS` when detecting
- ✅ Works on 3+ test vendor portals

**Test Requirements**:
- Unit test: URL pattern matching
- Unit test: DOM fingerprint generation
- Integration test: Portal detection on test vendor sites
- E2E test: Navigate to portal → detection works → notification shown

---

## PR4 — Form Detection + Autofill (Template Exists)

**Scope**: Form locator + selector resolver, autofill with confidence threshold, trigger real input/change events, notify operator after autofill ("Click Submit").

**Files**:
- `src/content/formDetect.ts` (field identification, semantic type inference)
- `src/content/autofill.ts` (autofill engine, input event triggering)
- `src/shared/selectors.ts` (selector generation, label finding)
- `src/shared/schemas.ts` (extend with FieldMappingSchema)

**Acceptance**:
- ✅ Form field detection: Identifies fields via label/for, name/id, aria-label
- ✅ Semantic type inference: amount, invoice_number, card_number, etc.
- ✅ Selector generation: Creates stable CSS selectors
- ✅ Autofill: Fills fields from payment data
- ✅ Autofill: Triggers real input/change/blur events
- ✅ Confidence threshold: Skips autofill if template confidence < 0.7
- ✅ Notification: `NEXT_STEP_REQUIRED` after autofill ("Form auto-filled. Click Submit.")
- ✅ Low confidence: Emits `WARNING` notification, disables autofill
- ✅ Works with React/Vue forms (event triggering)

**Test Requirements**:
- Unit test: Field detection logic
- Unit test: Semantic type inference
- Unit test: Autofill event triggering
- Integration test: Autofill on test form (jsdom)
- E2E test: Template exists → autofill works → notification shown

---

## PR5 — Obfuscation Layer

**Scope**: Sensitive field detection per template/pageKey, convert `type=text` → `password` or CSS mask, ensure portals still accept values.

**Files**:
- `src/content/obfuscate.ts` (sensitive field detection, obfuscation)
- `src/shared/sensitiveRules.ts` (sensitive keywords, semantic types)

**Acceptance**:
- ✅ Sensitive field detection: Identifies credentials, MFA, SSN, Tax ID, bank details, card fields
- ✅ Obfuscation: Converts `type="text"` → `type="password"` for credentials
- ✅ Obfuscation: Applies CSS masking for other sensitive fields (visual overlay)
- ✅ Whitelist: Payment amount, invoice number not obfuscated
- ✅ Portal compatibility: Obfuscation doesn't break portal validation
- ✅ Toggle: Can be disabled via operator preference

**Test Requirements**:
- Unit test: Sensitive field detection
- Integration test: Obfuscation on test form
- E2E test: Sensitive fields obfuscated, form still submits

---

## PR6 — Evidence Capture + Upload

**Scope**: Confirmation detection, capture screenshot, request presigned URL, upload to GCS, block Next Payment until upload complete, post evidence metadata.

**Files**:
- `src/content/scrape.ts` (confirmation detection)
- `src/background/evidence.ts` (screenshot capture, upload coordination)
- `src/shared/apiClient.ts` (extend with evidenceService helpers)
- `src/shared/schemas.ts` (extend with ConfirmationMetadataSchema)

**Acceptance**:
- ✅ Confirmation detection: URL patterns and DOM markers
- ✅ Screenshot capture: `chrome.tabs.captureVisibleTab` works
- ✅ Pre-signed URL: Gets URL from Evidence Service
- ✅ GCS upload: Uploads screenshot via PUT to pre-signed URL
- ✅ Retry logic: 3 retries with exponential backoff on upload failure
- ✅ Notification: `CAPTURING_EVIDENCE` → `UPLOADING_EVIDENCE` → `EVIDENCE_UPLOADED`
- ✅ Blocking: "Get Next Payment" disabled during upload
- ✅ Error handling: Upload failure shows `ERROR` notification with retry option

**Test Requirements**:
- Unit test: Confirmation detection logic
- Unit test: Upload retry logic (mock API)
- Integration test: Screenshot capture → upload (mock GCS)
- E2E test: Confirmation detected → screenshot uploaded → notification shown

---

## PR7 — Metadata Scraping + Completion Posting

**Scope**: Scrape confirmation#, invoice#, amounts, timestamps, payment method, post to payment service, emit completion telemetry.

**Files**:
- `src/content/scrape.ts` (extend with metadata scraping)
- `src/background/stateMachine.ts` (extend with completion flow)
- `src/shared/schemas.ts` (extend with ConfirmationMetadataSchema)

**Acceptance**:
- ✅ Metadata scraping: Confirmation number, invoice numbers, amount, timestamp, payment method
- ✅ Metadata posting: POST to `/api/v1/evidence/{paymentId}/metadata`
- ✅ Payment completion: Mark payment complete in Queue Service (if endpoint exists)
- ✅ State transition: COMPLETING → IDLE (or FETCHING if not stopAfterNext)
- ✅ Notification: `PAYMENT_COMPLETED` after successful completion
- ✅ Telemetry: `payment_completed` event with timing data
- ✅ Error handling: Metadata mismatch triggers WARNING + Exception option

**Test Requirements**:
- Unit test: Metadata scraping logic
- Unit test: Metadata posting (mock API)
- Integration test: Full completion flow
- E2E test: Confirmation → metadata scraped → posted → payment completed

---

## PR8 — Learning Mode (No Template) + Learning Service

**Scope**: Instrument input events to capture schemas/selectors, create Portal Learning Service + Pulumi infra, send learned payload after submit/confirmation.

**Files**:
- `src/content/learning.ts` (field capture, learning payload generation)
- `src/background/stateMachine.ts` (extend with LEARNING state)
- `infra/portal-learning-service/index.ts` (Pulumi infrastructure)
- `infra/portal-learning-service/Pulumi.yaml`
- `infra/portal-learning-service/main.go` (or main.py - service implementation)
- `src/shared/apiClient.ts` (extend with portalLearningService helpers)

**Acceptance**:
- ✅ Learning mode: Captures field selectors and semantic types on form interaction
- ✅ Learning mode: Tracks form submission → confirmation flow
- ✅ Learning payload: Builds payload (no sensitive values)
- ✅ Learning submission: POST to Portal Learning Service after confirmation
- ✅ Template retrieval: GET template from service on portal detection
- ✅ Template caching: Caches template in chrome.storage.local
- ✅ Pulumi: Portal Learning Service deployed to Cloud Run
- ✅ Firestore: Database created with proper indexes
- ✅ Template signing: RSA signature generation (backend) and verification (client)

**Test Requirements**:
- Unit test: Learning payload generation
- Unit test: Template signature verification
- Integration test: Learning mode → template stored → retrieved on next payment
- E2E test: New portal → learning mode → template learned → next payment uses template

---

## PR9 — Telemetry Sink + Analytics Wiring

**Scope**: Define telemetry event catalog, implement sink (BigQuery or HTTP), Pulumi dataset/table + IAM.

**Files**:
- `src/background/telemetry.ts` (event batching, BigQuery client)
- `infra/telemetry/index.ts` (Pulumi: BigQuery dataset/table)
- `infra/telemetry/Pulumi.yaml`
- `src/shared/types.ts` (extend with TelemetryEvent)

**Acceptance**:
- ✅ Event catalog: All key events defined (payment_fetched, portal_detected, autofill_attempted, etc.)
- ✅ Event batching: Buffer 10 events or 30s, whichever first
- ✅ BigQuery client: Direct streaming insert via service account
- ✅ Error handling: Retry on transient errors, local buffer if BigQuery unavailable
- ✅ Pulumi: BigQuery dataset and table created
- ✅ IAM: Service account with `roles/bigquery.dataEditor` role
- ✅ Telemetry: Every notification + key lifecycle emits events
- ✅ Events land in BigQuery with correct schema

**Test Requirements**:
- Unit test: Event batching logic
- Unit test: BigQuery insert (mock client)
- Integration test: Events written to BigQuery
- E2E test: Payment flow → events emitted → visible in BigQuery

---

## PR10 — Hardening + Admin Tools (Optional MVP+)

**Scope**: Template signature verification, suspicious behavior flags, admin-only debug mode, optional template feedback UI.

**Files**:
- `src/shared/selectors.ts` (extend with signature verification)
- `src/popup/components/DebugPanel.tsx` (admin-only debug UI)
- `src/background/stateMachine.ts` (extend with debug logging)

**Acceptance**:
- ✅ Signature verification: RSA-PSS signature verified client-side
- ✅ Tamper detection: Tampered templates rejected with error
- ✅ Debug mode: Admin-only debug panel in popup
- ✅ Debug logging: Enhanced logging in debug mode
- ✅ Template feedback: Operator can flag template issues

**Test Requirements**:
- Unit test: Signature verification
- Integration test: Tampered template rejected
- E2E test: Debug mode works for admins only

---

## MVP Gate Checklist

Before considering MVP "done-done", verify all items from PR0-PR9:

- [ ] Sign in works, stable session (token refresh works)
- [ ] Start → fetch next payment → show summary
- [ ] Portal detect → autofill known templates (confidence >= 0.7)
- [ ] Guided notifications at each step (NEXT_STEP_REQUIRED, AUTO_ACTION_IN_PROGRESS, etc.)
- [ ] Obfuscation on sensitive steps (credentials, card fields)
- [ ] Confirmation screenshot + metadata posted
- [ ] Get next payment loop works (auto-fetch after completion)
- [ ] Exception workflow parks payment
- [ ] Key telemetry emits (payment_fetched, portal_detected, autofill_attempted, payment_completed)
- [ ] Learning mode captures templates for new portals
- [ ] Template retrieval and application works
- [ ] Error handling: Retries, notifications, recovery flows
- [ ] State persistence: Survives service worker restart

