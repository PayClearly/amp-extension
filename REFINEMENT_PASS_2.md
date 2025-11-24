# Second Pass Refinement: PayClearly Chrome Extension

## 1. Assumptions Resolution

### Assumption 1: OAuth Flow Uses Chrome Identity API
**Original Assumption**: Extension uses `chrome.identity.getAuthToken()` for OAuth
**Decision**: ✅ **KEEP** - Standard for Chrome Extensions, secure, handles token refresh
**Justification**: Chrome Identity API is the recommended approach for extensions. It handles OAuth flow securely without exposing tokens to content scripts.

### Assumption 2: Token Exchange Endpoint Format
**Original Assumption**: Backend has `/api/v1/auth/exchange` endpoint
**Decision**: ✅ **CONCRETE** - Endpoint: `POST /api/v1/auth/exchange`
**Request**: `{ "token": "chrome_identity_token" }`
**Response**: `{ "access_token": "...", "refresh_token": "...", "expires_in": 3600, "operator_id": "op_123" }`
**Justification**: Standard OAuth token exchange pattern.

### Assumption 3: Portal Detection Uses URL Patterns + DOM Fingerprinting
**Original Assumption**: Combination of URL matching and DOM landmarks
**Decision**: ✅ **KEEP** - Multi-layered approach with confidence scoring
**Justification**: URL patterns are fast but fragile; DOM fingerprinting is more resilient to URL changes. Combined approach provides best coverage.

### Assumption 4: Template Storage Uses Firestore
**Original Assumption**: Firestore for portal templates
**Decision**: ✅ **KEEP** - Firestore for MVP, can migrate to Cloud SQL if needed
**Justification**: Firestore is serverless, scales automatically, and integrates well with Cloud Run. Migration path exists if relational queries become critical.

### Assumption 5: Telemetry Uses BigQuery Direct Insert
**Original Assumption**: Direct BigQuery streaming or HTTP service
**Decision**: ✅ **CONCRETE** - Direct BigQuery streaming insert via service account
**Justification**: Simpler architecture, lower latency, fewer moving parts. HTTP service can be added later if batching/transformation needed.

### Assumption 6: Template Confidence Threshold Default
**Original Assumption**: 0.7 default threshold
**Decision**: ✅ **KEEP** - 0.7 default, configurable per portal
**Justification**: 0.7 provides good balance between safety and automation. Can be tuned per portal based on success rates.

### Assumption 7: Evidence Upload Uses Pre-signed URLs
**Original Assumption**: Evidence Service returns pre-signed GCS URLs
**Decision**: ✅ **KEEP** - Standard pattern for secure uploads
**Justification**: Pre-signed URLs allow direct upload to GCS without exposing service account keys to extension.

### Assumption 8: Host Permissions Strategy
**Original Assumption**: Start with `<all_urls>`, restrict later
**Decision**: ✅ **CONCRETE** - Use `<all_urls>` for MVP, add dynamic host permissions per payment in v2
**Justification**: Internal-only distribution reduces security risk. Dynamic permissions add complexity that can be deferred.

### Assumption 9: State Persistence Uses chrome.storage.session
**Original Assumption**: Session storage for active state, local for preferences
**Decision**: ✅ **KEEP** - Session storage for payment state, local for templates/cache
**Justification**: Session storage clears on browser close, appropriate for sensitive payment data. Local storage for non-sensitive cached templates.

### Assumption 10: Notification Blocking Rules
**Original Assumption**: Blocking notifications disable "Get Next Payment"
**Decision**: ✅ **CONCRETE** - See State Machine section for exact rules
**Justification**: Prevents operator from starting new payment while automation is in progress.

### Assumption 11: Template Signing Algorithm
**Original Assumption**: RSA signature verification
**Decision**: ✅ **CONCRETE** - RSA-PSS with SHA-256
**Justification**: Industry standard, secure, supported by Node.js crypto module.

### Assumption 12: Long-poll Timeout
**Original Assumption**: 30 second timeout for queue polling
**Decision**: ✅ **KEEP** - 30s default, max 60s, configurable
**Justification**: Balances responsiveness with server resource usage.

### Assumption 13: Retry Strategy
**Original Assumption**: 3 retries with exponential backoff + jitter
**Decision**: ✅ **CONCRETE** - 3 retries, exponential backoff (1s, 2s, 4s), ±20% jitter
**Justification**: Standard retry pattern prevents thundering herd while providing resilience.

### Assumption 14: SPA Navigation Detection
**Original Assumption**: MutationObserver + URL change detection
**Decision**: ✅ **KEEP** - Combined approach with 2s polling fallback
**Justification**: MutationObserver handles most cases, polling provides fallback for edge cases.

---

## 2. API Contract Pack

### 2.1 Queue Passthrough Service

#### GET /api/v1/queue/next-payment

**Description**: Long-polling endpoint that returns the next priority payment for the authenticated operator.

**Authentication**:
- Header: `Authorization: Bearer <access_token>`
- Token validated via Auth Service public key

**Query Parameters**:
- `timeout` (optional, integer, default: 30, max: 60): Long-poll timeout in seconds

**Request Example**:
```http
GET /api/v1/queue/next-payment?timeout=30
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response 200 OK**:
```json
{
  "payment": {
    "id": "pay_abc123",
    "accountId": "acc_456",
    "clientId": "client_789",
    "vendorId": "vendor_xyz",
    "vendorName": "Acme Corporation",
    "amount": 1234.56,
    "currency": "USD",
    "invoiceNumbers": ["INV-2024-001", "INV-2024-002"],
    "portalId": "portal_acme",
    "portalUrl": "https://portal.acme.com/payment",
    "virtualCard": {
      "cardNumber": "4111111111111111",
      "expiry": "12/25",
      "cvv": "123",
      "accountNumber": "123456789",
      "routingNumber": "987654321"
    },
    "metadata": {
      "priority": "high",
      "dueDate": "2024-01-15T00:00:00Z",
      "notes": "Rush payment"
    }
  },
  "queuePosition": 3,
  "estimatedWaitTime": 120
}
```

**Response 204 No Content**:
- No payment available (long-poll timeout)
- No body

**Response 401 Unauthorized**:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "details": {}
  }
}
```

**Response 429 Too Many Requests**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Limit: 10 per minute.",
    "details": {
      "retryAfter": 60
    }
  }
}
```

**Response 500 Internal Server Error**:
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Queue service unavailable",
    "details": {
      "requestId": "req_abc123"
    }
  }
}
```

**Idempotency**: N/A (read-only operation)

**Rate Limiting**: 10 requests per minute per operator

---

### 2.2 Portal Learning Service

#### GET /api/v1/portals/templates

**Description**: Retrieve template for a specific portal/account/client/vendor/page combination.

**Authentication**:
- Header: `Authorization: Bearer <access_token>`

**Query Parameters** (all required):
- `portalId` (string): Portal identifier
- `accountId` (string): Account identifier
- `clientId` (string): Client identifier
- `vendorId` (string): Vendor identifier
- `pageKey` (string, optional, default: "default"): Page identifier (e.g., "payment_form", "login")

**Request Example**:
```http
GET /api/v1/portals/templates?portalId=portal_acme&accountId=acc_456&clientId=client_789&vendorId=vendor_xyz&pageKey=payment_form
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response 200 OK**:
```json
{
  "template": {
    "id": "template_abc123",
    "portalId": "portal_acme",
    "accountId": "acc_456",
    "clientId": "client_789",
    "vendorId": "vendor_xyz",
    "pageKey": "payment_form",
    "fields": [
      {
        "selector": "#amount-input",
        "semanticType": "amount",
        "inputType": "number",
        "label": "Payment Amount",
        "confidence": 0.9
      },
      {
        "selector": "#invoice-input",
        "semanticType": "invoice_number",
        "inputType": "text",
        "label": "Invoice Number",
        "confidence": 0.85
      },
      {
        "selector": "[name='cardNumber']",
        "semanticType": "card_number",
        "inputType": "text",
        "label": "Card Number",
        "confidence": 0.8
      }
    ],
    "confidence": 0.87,
    "version": 2,
    "signature": "base64_rsa_signature_here",
    "url": "https://portal.acme.com/payment",
    "fingerprint": "abc123def456...",
    "createdAt": "2024-01-10T12:00:00Z",
    "updatedAt": "2024-01-15T14:30:00Z",
    "usageCount": 15,
    "successRate": 0.93
  }
}
```

**Response 404 Not Found**:
```json
{
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "No template found for specified portal/account/client/vendor/page combination",
    "details": {}
  }
}
```

#### POST /api/v1/portals/templates

**Description**: Create or update a portal template from learning mode.

**Authentication**:
- Header: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "portalId": "portal_acme",
  "accountId": "acc_456",
  "clientId": "client_789",
  "vendorId": "vendor_xyz",
  "pageKey": "payment_form",
  "fields": [
    {
      "selector": "#amount-input",
      "semanticType": "amount",
      "inputType": "number",
      "label": "Payment Amount",
      "confidence": 0.9
    },
    {
      "selector": "#invoice-input",
      "semanticType": "invoice_number",
      "inputType": "text",
      "label": "Invoice Number",
      "confidence": 0.85
    }
  ],
  "confidence": 0.87,
  "url": "https://portal.acme.com/payment",
  "fingerprint": "abc123def456..."
}
```

**Response 201 Created** (new template):
```json
{
  "template": {
    "id": "template_abc123",
    "version": 1,
    "signature": "base64_rsa_signature_here",
    "createdAt": "2024-01-15T14:30:00Z",
    "updatedAt": "2024-01-15T14:30:00Z"
  }
}
```

**Response 200 OK** (updated template):
```json
{
  "template": {
    "id": "template_abc123",
    "version": 2,
    "signature": "base64_rsa_signature_here",
    "createdAt": "2024-01-10T12:00:00Z",
    "updatedAt": "2024-01-15T14:30:00Z"
  }
}
```

**Response 400 Bad Request**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "field": "fields",
      "issue": "At least one field is required"
    }
  }
}
```

**Idempotency**:
- If template exists for same portal/account/client/vendor/page, increments version
- Fields are merged (new fields added, existing fields updated if confidence higher)

**Rate Limiting**: 100 requests per minute per operator

#### PUT /api/v1/portals/templates/{templateId}/usage

**Description**: Update usage statistics after autofill attempt.

**Authentication**:
- Header: `Authorization: Bearer <access_token>`

**Path Parameters**:
- `templateId` (string): Template identifier

**Request Body**:
```json
{
  "success": true,
  "fieldsFilled": 5,
  "totalFields": 6
}
```

**Response 200 OK**:
```json
{
  "success": true,
  "updatedStats": {
    "usageCount": 16,
    "successRate": 0.9375
  }
}
```

**Idempotency**: N/A (statistics are cumulative)

---

### 2.3 Evidence Service

#### POST /api/v1/evidence/presigned-url

**Description**: Get pre-signed URL for uploading screenshot to GCS.

**Authentication**:
- Header: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "paymentId": "pay_abc123",
  "filename": "screenshot_1705320000000.png",
  "contentType": "image/png"
}
```

**Response 200 OK**:
```json
{
  "url": "https://storage.googleapis.com/payclearly-evidence-dev/screenshots/pay_abc123/screenshot_1705320000000.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=...",
  "expiresAt": "2024-01-15T15:00:00Z"
}
```

**Response 400 Bad Request**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid paymentId or filename",
    "details": {}
  }
}
```

#### POST /api/v1/evidence/{paymentId}/metadata

**Description**: Upload confirmation metadata for a payment.

**Authentication**:
- Header: `Authorization: Bearer <access_token>`

**Path Parameters**:
- `paymentId` (string): Payment identifier

**Request Body**:
```json
{
  "screenshotUrl": "gs://payclearly-evidence-dev/screenshots/pay_abc123/screenshot_1705320000000.png",
  "confirmationNumber": "CONF-2024-001",
  "invoiceNumbers": ["INV-2024-001", "INV-2024-002"],
  "amount": 1234.56,
  "timestamp": "2024-01-15T14:30:00Z",
  "paymentMethod": "Virtual Card",
  "transactionId": "TXN-abc123",
  "metadata": {
    "portalUrl": "https://portal.acme.com/payment/confirm",
    "scrapedAt": "2024-01-15T14:30:05Z"
  }
}
```

**Response 200 OK**:
```json
{
  "success": true,
  "evidenceId": "evid_abc123"
}
```

**Idempotency**:
- If metadata already exists for paymentId, returns existing evidenceId (idempotent)

---

### 2.4 Telemetry Sink (BigQuery Direct)

**Note**: Extension writes directly to BigQuery via service account. No HTTP endpoint needed.

**Table**: `payclearly_extension_telemetry.events`

**Schema**:
```sql
event_id STRING NOT NULL,
event_type STRING NOT NULL,
timestamp TIMESTAMP NOT NULL,
operator_id STRING,
payment_id STRING,
portal_id STRING,
page_key STRING,
metadata JSON,
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
```

**Insert Example** (via BigQuery streaming insert):
```json
{
  "event_id": "evt_abc123",
  "event_type": "payment_fetched",
  "timestamp": "2024-01-15T14:30:00Z",
  "operator_id": "op_456",
  "payment_id": "pay_abc123",
  "portal_id": "portal_acme",
  "page_key": "payment_form",
  "metadata": {
    "queuePosition": 3,
    "estimatedWaitTime": 120
  },
  "created_at": "2024-01-15T14:30:00Z"
}
```

**Authentication**: Service account with `roles/bigquery.dataEditor` role

**Error Handling**:
- Retry on transient errors (network, quota)
- Buffer events locally if BigQuery unavailable
- Log errors to console (no telemetry for telemetry failures)

---

## 3. State Machines

### 3.1 Background Worker State Machine

**States**:
- `IDLE`: No active payment, ready to fetch
- `FETCHING`: Polling queue for next payment
- `ACTIVE`: Payment fetched, waiting for portal interaction
- `LEARNING`: Learning mode active (no template)
- `COMPLETING`: Capturing evidence and uploading
- `TEMPLATE_MISMATCH`: Template confidence too low
- `EXCEPTION`: Exception created, payment parked
- `BLOCKED_AUTOMATION`: Captcha or automation blocked

**Transition Table**:

| Current State | Event | Condition | Next State | Actions |
|--------------|-------|-----------|------------|---------|
| IDLE | GET_NEXT_PAYMENT | - | FETCHING | Emit FETCHING_PAYMENT notification |
| FETCHING | PAYMENT_RECEIVED | Payment found | ACTIVE | Store payment, emit notification |
| FETCHING | NO_PAYMENT | Timeout (204) | IDLE | Clear state |
| FETCHING | ERROR | Retries exhausted | IDLE | Emit ERROR, log telemetry |
| ACTIVE | PORTAL_DETECTED | Template exists, confidence >= 0.7 | ACTIVE | Trigger autofill, emit NEXT_STEP_REQUIRED |
| ACTIVE | PORTAL_DETECTED | No template | LEARNING | Emit LEARNING_MODE |
| ACTIVE | PORTAL_DETECTED | Template exists, confidence < 0.7 | TEMPLATE_MISMATCH | Emit WARNING |
| ACTIVE | CAPTCHA_DETECTED | - | BLOCKED_AUTOMATION | Emit NEXT_STEP_REQUIRED (captcha) |
| ACTIVE | CONFIRMATION_DETECTED | - | COMPLETING | Emit CAPTURING_EVIDENCE |
| LEARNING | CONFIRMATION_DETECTED | - | COMPLETING | Submit learning payload, emit CAPTURING_EVIDENCE |
| TEMPLATE_MISMATCH | OPERATOR_CONTINUE | Operator chooses to continue | ACTIVE | Emit WARNING cleared |
| TEMPLATE_MISMATCH | CREATE_EXCEPTION | - | EXCEPTION | Create exception, transition to IDLE |
| BLOCKED_AUTOMATION | CONFIRMATION_DETECTED | - | COMPLETING | Emit CAPTURING_EVIDENCE |
| COMPLETING | EVIDENCE_UPLOADED | Upload success | IDLE or FETCHING | If stopAfterNext: IDLE, else: FETCHING |
| COMPLETING | EVIDENCE_UPLOAD_FAILED | Upload failed | IDLE | Emit ERROR, allow retry |
| EXCEPTION | - | - | IDLE | Clear payment state |

**State Persistence**:
- All state transitions persist to `chrome.storage.session`
- State restored on service worker restart

---

### 3.2 Content Script Portal Step Lifecycle

**States** (per page):
- `DETECTING`: Portal detection in progress
- `DETECTED`: Portal identified, waiting for form
- `FORM_READY`: Form detected, ready for autofill
- `AUTOFILLED`: Autofill completed (if template exists)
- `LEARNING`: Learning mode active (capturing fields)
- `MANUAL_FILL`: Operator filling manually
- `SUBMITTED`: Form submitted, waiting for confirmation
- `CONFIRMATION`: Confirmation page detected

**Transition Table**:

| Current State | Event | Condition | Next State | Actions |
|--------------|-------|-----------|------------|---------|
| DETECTING | PORTAL_DETECTED | Portal identified | DETECTED | Emit PORTAL_DETECTED to background |
| DETECTED | FORM_DETECTED | Form found in DOM | FORM_READY | Check for template |
| FORM_READY | TEMPLATE_EXISTS | Template found, confidence >= 0.7 | AUTOFILLED | Execute autofill, emit NEXT_STEP_REQUIRED |
| FORM_READY | NO_TEMPLATE | No template found | LEARNING | Start learning mode |
| FORM_READY | TEMPLATE_LOW_CONFIDENCE | Template confidence < 0.7 | MANUAL_FILL | Emit WARNING |
| AUTOFILLED | OPERATOR_CLICK | Operator clicks submit | SUBMITTED | Wait for navigation |
| LEARNING | FIELD_INTERACTION | Operator interacts with field | LEARNING | Capture field mapping |
| LEARNING | FORM_SUBMITTED | Form submitted | SUBMITTED | Submit learning payload |
| MANUAL_FILL | FORM_SUBMITTED | Form submitted | SUBMITTED | - |
| SUBMITTED | CONFIRMATION_DETECTED | Confirmation page loaded | CONFIRMATION | Scrape metadata, emit CONFIRMATION_DETECTED |
| CONFIRMED | - | - | DETECTING | Reset for next page |

**SPA Navigation Handling**:
- On URL change or significant DOM mutation, reset to `DETECTING`
- Re-run portal detection
- Maintain state in `chrome.storage.session` keyed by tabId

---

### 3.3 Notification Blocking Rules

**Blocking Notifications** (disable "Get Next Payment"):
- `FETCHING_PAYMENT` (AUTO_ACTION_IN_PROGRESS)
- `CAPTURING_EVIDENCE` (AUTO_ACTION_IN_PROGRESS)
- `UPLOADING_EVIDENCE` (AUTO_ACTION_IN_PROGRESS)
- `TOKEN_EXPIRED` (ERROR)
- `EVIDENCE_UPLOAD_FAILED` (ERROR, blocking: true)
- `PAYMENT_FETCH_FAILED` (ERROR, blocking: true)

**Non-Blocking Notifications** (allow "Get Next Payment"):
- `AUTOFILL_COMPLETE` (NEXT_STEP_REQUIRED, but operator can still get next payment)
- `LEARNING_MODE` (NEXT_STEP_REQUIRED)
- `CAPTCHA_DETECTED` (NEXT_STEP_REQUIRED)
- `TEMPLATE_LOW_CONFIDENCE` (WARNING)
- `TEMPLATE_MISMATCH` (WARNING)
- `EVIDENCE_UPLOADED` (AUTO_ACTION_COMPLETE)
- `PAYMENT_COMPLETED` (AUTO_ACTION_COMPLETE)
- `TEMPLATE_LEARNED` (AUTO_ACTION_COMPLETE)
- `EXCEPTION_CREATED` (AUTO_ACTION_COMPLETE)

**Notification Stack Rules**:
- Maximum 10 notifications in stack
- Oldest notifications auto-removed when limit reached
- Latest notification always displayed in popup banner
- History available in collapsible section

---

## 4. Top 10 Risks with Mitigations

### Risk 1: Portal Fragility (High)
**Description**: Vendor portals change selectors, break autofill
**Impact**: High - Autofill fails, operator must manually fill
**Mitigation**:
- Confidence thresholds (don't autofill if < 0.7)
- Learning mode captures new selectors automatically
- Template versioning with fallback to manual
- Operator can disable autofill per portal
- Monitoring: track autofill success rate, alert on drops > 20%
**Early Validation**:
- **Spike Ticket**: Test autofill on 5 different vendor portals, measure success rate
- **Validation**: Autofill works on 80%+ of test portals

### Risk 2: SPA Navigation Detection (Medium)
**Description**: Single-page apps don't trigger navigation events
**Impact**: Medium - Portal detection fails, autofill doesn't trigger
**Mitigation**:
- MutationObserver for DOM changes (debounced 500ms)
- URL change detection via `popstate` and `pushState` interception
- Portal detection re-runs on significant DOM mutations
- Timeout fallback: re-detect every 5s if no portal detected
**Early Validation**:
- **Spike Ticket**: Test on 3 SPA-based vendor portals, verify detection works
- **Validation**: Portal detected within 2s of page load on all test portals

### Risk 3: Token Expiry During Payment (Medium)
**Description**: Access token expires mid-payment flow
**Impact**: Medium - Payment fails, operator must restart
**Mitigation**:
- Proactive refresh (15min before expiry)
- Background worker monitors token age
- Retry with refresh on 401 responses
- Store refresh token securely (encrypted local fallback)
**Early Validation**:
- **Spike Ticket**: Simulate token expiry during payment, verify refresh works
- **Validation**: Payment completes successfully after token refresh

### Risk 4: Evidence Upload Failure (Medium)
**Description**: Screenshot upload fails, payment marked complete without evidence
**Impact**: Medium - Compliance risk, missing audit trail
**Mitigation**:
- Retry upload 3 times with exponential backoff
- Store screenshot locally (chrome.storage.local, max 5MB) if upload fails
- Operator notification: "Evidence upload failed. Retry?"
- Payment not marked complete until evidence confirmed
- Fallback: operator can manually upload screenshot
**Early Validation**:
- **Spike Ticket**: Simulate network failure during upload, verify retry logic
- **Validation**: Evidence upload succeeds after retry, or operator notified

### Risk 5: Template Tampering (Low)
**Description**: Malicious template injection
**Impact**: Low - Security risk
**Mitigation**:
- Template signatures (RSA-PSS, verified client-side)
- Server-side validation of template structure
- PortalId validated against payment data
- No sensitive data in templates (only selectors + semantic types)
**Early Validation**:
- **Spike Ticket**: Attempt to inject tampered template, verify rejection
- **Validation**: Tampered templates rejected with error notification

### Risk 6: Service Worker Restart (Low)
**Description**: Chrome kills service worker, state lost
**Impact**: Low - Payment context lost
**Mitigation**:
- State persisted in chrome.storage.session
- State machine recovers from storage on startup
- Payment context restored from storage
- Long-running operations checkpointed
**Early Validation**:
- **Spike Ticket**: Force service worker restart during payment, verify state recovery
- **Validation**: Payment state restored correctly after restart

### Risk 7: Captcha Detection (Medium)
**Description**: Autofill triggers captcha, operator blocked
**Impact**: Medium - Operator must solve manually, slows workflow
**Mitigation**:
- Detect captcha presence (iframe, challenge divs, reCAPTCHA markers)
- Emit WARNING notification: "Captcha detected. Please solve manually."
- Skip autofill on pages with captcha
- Learning mode: mark page as "captcha_required" in template
**Early Validation**:
- **Spike Ticket**: Test on portal with captcha, verify detection and skip autofill
- **Validation**: Captcha detected, autofill skipped, operator notified

### Risk 8: Performance Degradation (Low)
**Description**: MutationObservers slow down portal pages
**Impact**: Low - Portal pages feel sluggish
**Mitigation**:
- Debounce observers (500ms)
- Throttle portal detection (max once per 2s)
- Unobserve after portal detected and autofill complete
- Lightweight selectors (avoid deep DOM traversal)
**Early Validation**:
- **Spike Ticket**: Measure page load time with/without extension, verify < 100ms overhead
- **Validation**: No noticeable performance impact on test portals

### Risk 9: BigQuery Quota Limits (Low)
**Description**: Telemetry inserts exceed BigQuery quota
**Impact**: Low - Telemetry events lost
**Mitigation**:
- Batch events (buffer 10 events or 30s, whichever first)
- Exponential backoff on quota errors
- Local buffer if BigQuery unavailable (chrome.storage.local, max 100 events)
- Graceful degradation: continue operation if telemetry fails
**Early Validation**:
- **Spike Ticket**: Generate 1000 events rapidly, verify batching and quota handling
- **Validation**: All events eventually written to BigQuery, no operation blocking

### Risk 10: Multi-tab Confusion (Medium)
**Description**: Operator opens multiple payments in different tabs
**Impact**: Medium - State confusion, wrong payment processed
**Mitigation**:
- Single active payment per extension instance
- Tab tracking: only process payment from tab that opened portal URL
- State keyed by tabId in chrome.storage.session
- Popup shows warning if multiple tabs detected
**Early Validation**:
- **Spike Ticket**: Open 2 payments in different tabs, verify correct payment processed
- **Validation**: Only payment from correct tab is processed, other tab ignored

---

## 5. PR-Ready Task Breakdown

### PR0 — Repo + Tooling Skeleton

**Scope**: Create extension repo structure, build tooling, shared types

**Files**:
- `manifest.json` (stub with basic permissions)
- `package.json` (dependencies, scripts)
- `tsconfig.json` (strict TypeScript config)
- `.eslintrc.json`, `.prettierrc` (linting/formatting)
- `webpack.config.js` (build configuration)
- `src/shared/types.ts` (core type definitions)
- `src/shared/schemas.ts` (Zod schemas)
- `src/shared/events.ts` (event types, notification catalog)
- `src/shared/logger.ts` (logging utility)
- `src/popup/index.html` (empty popup)
- `src/popup/index.tsx` (React entry point, empty App)
- `src/background/index.ts` (service worker stub)
- `src/content/index.ts` (content script stub)
- `tests/` (test harness setup)

**Acceptance Criteria**:
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

### PR1 — Auth + Session Bootstrapping

**Scope**: Implement authentication flow, token management, popup sign-in UI

**Files**:
- `src/background/auth.ts` (OAuth flow, token refresh)
- `src/background/index.ts` (auth message handlers)
- `src/shared/apiClient.ts` (HTTP client with token injection)
- `src/shared/config.ts` (environment configuration)
- `src/popup/App.tsx` (sign-in UI, session status)
- `src/popup/components/AuthPrompt.tsx` (new component)

**Acceptance Criteria**:
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

### PR2 — Queue Fetch + Active Session State Machine

**Scope**: Background state machine, queue integration, payment fetching, popup state display

**Files**:
- `src/background/stateMachine.ts` (state machine implementation)
- `src/background/queue.ts` (queue service integration)
- `src/shared/types.ts` (extend with StateContext)
- `src/popup/state/useExtensionState.ts` (React state hook)
- `src/popup/components/Controls.tsx` (Start/Stop buttons)
- `src/popup/components/PaymentSummary.tsx` (payment display)

**Acceptance Criteria**:
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

### PR3 — Portal Detection + Content Script Injection

**Scope**: Portal detection, content script injection, SPA navigation handling, notifications

**Files**:
- `src/content/portalDetect.ts` (URL patterns, DOM fingerprinting)
- `src/content/index.ts` (SPA navigation detection, message handling)
- `src/content/notifications.ts` (notification emission to background)
- `src/shared/events.ts` (extend with portal events)
- `manifest.json` (host_permissions: `<all_urls>`)

**Acceptance Criteria**:
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

### PR4 — Form Detection + Autofill (Template Exists)

**Scope**: Form field detection, autofill engine, template application, confidence thresholds

**Files**:
- `src/content/formDetect.ts` (field identification, semantic type inference)
- `src/content/autofill.ts` (autofill engine, input event triggering)
- `src/shared/selectors.ts` (selector generation, label finding)
- `src/shared/schemas.ts` (extend with FieldMapping schema)

**Acceptance Criteria**:
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

### PR5 — Obfuscation Layer

**Scope**: Sensitive field detection, input obfuscation (password type, CSS masking)

**Files**:
- `src/content/obfuscate.ts` (sensitive field detection, obfuscation)
- `src/shared/sensitiveRules.ts` (sensitive keywords, semantic types)

**Acceptance Criteria**:
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

### PR6 — Evidence Capture + Upload

**Scope**: Confirmation detection, screenshot capture, GCS upload via pre-signed URL

**Files**:
- `src/content/scrape.ts` (confirmation detection)
- `src/background/evidence.ts` (screenshot capture, upload coordination)
- `src/shared/apiClient.ts` (extend with evidenceService helpers)

**Acceptance Criteria**:
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

### PR7 — Metadata Scraping + Completion Posting

**Scope**: Scrape confirmation metadata, post to Evidence Service, mark payment complete

**Files**:
- `src/content/scrape.ts` (extend with metadata scraping)
- `src/background/stateMachine.ts` (extend with completion flow)
- `src/shared/schemas.ts` (extend with ConfirmationMetadata schema)

**Acceptance Criteria**:
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

### PR8 — Learning Mode + Learning Service

**Scope**: Learning mode capture, Portal Learning Service integration, Pulumi infrastructure

**Files**:
- `src/content/learning.ts` (field capture, learning payload generation)
- `src/background/stateMachine.ts` (extend with LEARNING state)
- `infra/portal-learning-service/index.ts` (Pulumi infrastructure)
- `infra/portal-learning-service/main.go` (or main.py - service implementation)

**Acceptance Criteria**:
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

### PR9 — Telemetry Sink + Analytics Wiring

**Scope**: Telemetry event batching, BigQuery integration, Pulumi infrastructure

**Files**:
- `src/background/telemetry.ts` (event batching, BigQuery client)
- `infra/telemetry/index.ts` (Pulumi: BigQuery dataset/table)
- `src/shared/types.ts` (extend with TelemetryEvent)

**Acceptance Criteria**:
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

### PR10 — Hardening + Admin Tools (Optional MVP+)

**Scope**: Template signature verification, debug mode, template feedback UI

**Files**:
- `src/shared/selectors.ts` (extend with signature verification)
- `src/popup/components/DebugPanel.tsx` (admin-only debug UI)
- `src/background/stateMachine.ts` (extend with debug logging)

**Acceptance Criteria**:
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

## 6. First 2 Weeks Execution Plan (10 Working Days, 2 Engineers)

### Week 1: Foundation + Core Flow

#### Day 1 (Monday) - Setup + Auth
**Engineer A**:
- PR0: Repo setup, tooling, shared types (4h)
- PR1: Auth flow implementation (4h)

**Engineer B**:
- PR0: Build config, test harness (4h)
- PR1: Popup sign-in UI (4h)

**Deliverable**: Extension loads, auth works, operator can sign in

---

#### Day 2 (Tuesday) - Queue + State Machine
**Engineer A**:
- PR2: State machine implementation (4h)
- PR2: Queue service integration (4h)

**Engineer B**:
- PR2: Popup state management (4h)
- PR2: Payment summary UI (4h)

**Deliverable**: "Get Next Payment" works, payment displayed in popup

---

#### Day 3 (Wednesday) - Portal Detection
**Engineer A**:
- PR3: Portal detection (URL patterns) (4h)
- PR3: DOM fingerprinting (4h)

**Engineer B**:
- PR3: Content script injection (4h)
- PR3: SPA navigation handling (4h)

**Deliverable**: Portal detection works on test vendor sites

---

#### Day 4 (Thursday) - Form Detection + Autofill
**Engineer A**:
- PR4: Form field detection (4h)
- PR4: Semantic type inference (4h)

**Engineer B**:
- PR4: Autofill engine (4h)
- PR4: Event triggering (React/Vue compatibility) (4h)

**Deliverable**: Autofill works on test forms with known templates

---

#### Day 5 (Friday) - Obfuscation + Evidence
**Engineer A**:
- PR5: Obfuscation layer (4h)
- PR6: Confirmation detection (2h)
- PR6: Screenshot capture (2h)

**Engineer B**:
- PR6: Evidence upload (pre-signed URL) (4h)
- PR6: Retry logic (4h)

**Deliverable**: Obfuscation works, evidence capture and upload works

---

### Week 2: Learning + Telemetry + Polish

#### Day 6 (Monday) - Metadata + Completion
**Engineer A**:
- PR7: Metadata scraping (4h)
- PR7: Completion posting (4h)

**Engineer B**:
- PR7: State machine completion flow (4h)
- PR7: Error handling and retries (4h)

**Deliverable**: Full payment completion flow works end-to-end

---

#### Day 7 (Tuesday) - Learning Mode
**Engineer A**:
- PR8: Learning mode capture (4h)
- PR8: Learning payload generation (4h)

**Engineer B**:
- PR8: Portal Learning Service (backend implementation) (4h)
- PR8: Template retrieval and caching (4h)

**Deliverable**: Learning mode captures templates, service stores them

---

#### Day 8 (Wednesday) - Learning Service Infrastructure
**Engineer A**:
- PR8: Pulumi infrastructure for Portal Learning Service (4h)
- PR8: Firestore setup and indexes (4h)

**Engineer B**:
- PR8: Template signing (RSA) (4h)
- PR8: Template signature verification (client) (4h)

**Deliverable**: Portal Learning Service deployed, templates signed and verified

---

#### Day 9 (Thursday) - Telemetry
**Engineer A**:
- PR9: Telemetry event catalog (2h)
- PR9: Event batching (2h)
- PR9: BigQuery client integration (4h)

**Engineer B**:
- PR9: Pulumi BigQuery infrastructure (4h)
- PR9: IAM and service accounts (2h)
- PR9: Telemetry wiring throughout codebase (2h)

**Deliverable**: Telemetry events emitted and written to BigQuery

---

#### Day 10 (Friday) - Testing + Bug Fixes
**Engineer A**:
- End-to-end testing (4h)
- Bug fixes (4h)

**Engineer B**:
- Integration testing (4h)
- Documentation updates (2h)
- Final polish (2h)

**Deliverable**: MVP complete, tested, ready for internal testing

---

## MVP Gate Checklist

Before considering MVP "done-done", verify:

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

---

## Blocking Questions

**None identified.** All assumptions resolved with concrete decisions or justified defaults.

