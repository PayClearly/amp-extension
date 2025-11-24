# Engineering Plan: PayClearly Chrome Extension

## 1. Architecture Overview

### 1.1 System Architecture Diagram (Text Description)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────────┐                  │
│  │   Popup UI   │◄────────┤  Background SW   │                  │
│  │   (React)    │  Events │  (Service Worker)│                  │
│  └──────────────┘         └──────────────────┘                  │
│         │                        │                              │
│         │                        │ chrome.runtime.sendMessage    │
│         │                        ▼                              │
│         │              ┌──────────────────┐                      │
│         │              │  Content Scripts  │                      │
│         │              │  (Portal Pages)   │                      │
│         │              └──────────────────┘                      │
│         │                        │                              │
│         └────────────────────────┘                              │
│                  chrome.storage.session                          │
│                  chrome.storage.local                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Services (GCP)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Auth Service │  │Queue Service │  │Payment Service│          │
│  │  (existing)  │  │ (passthrough)│  │  (existing)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Portal Learning│  │Exception Svc │  │Evidence Svc  │          │
│  │   Service     │  │  (existing)  │  │  (existing)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │Telemetry Sink│  │   GCS Bucket │                             │
│  │  (BigQuery)  │  │  (Evidence)  │                             │
│  └──────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

**Popup UI (React)**
- Operator controls (Start/Stop/Create Exception/Get Next Payment)
- Payment summary display
- Notification banner + log stack
- State/progress indicators

**Background Service Worker**
- Authentication token lifecycle (refresh every 15min, store in memory)
- Payment queue polling (long-poll with 30s timeout, retry with jitter)
- State machine orchestration
- Evidence upload coordination (pre-signed URL → GCS)
- Telemetry event batching and posting
- Cross-tab coordination via chrome.storage.session

**Content Scripts**
- Portal detection (URL patterns + DOM fingerprinting)
- Form field detection and mapping
- Autofill execution (with confidence thresholds)
- Learning mode (capture selectors + semantics)
- Input obfuscation (sensitive fields → password type or masked)
- Confirmation detection and evidence capture triggers
- Notification emission to background worker

**Storage Strategy**
- `chrome.storage.session`: Active payment state, current portal context, temp tokens
- `chrome.storage.local`: User preferences, cached portal templates (max 50KB), operator ID
- No sensitive data persisted (tokens in memory only)

---

## 2. Detailed Task Breakdown by Milestone

### Milestone 1: MVP (Weeks 1-4)

#### Week 1: Foundation & Auth
- [ ] **Task 1.1**: Project scaffolding (TypeScript, React, build config)
  - Files: `package.json`, `tsconfig.json`, `webpack.config.js`, `manifest.json`
  - Dependencies: React 18, TypeScript 5.x, Zod, chrome-types
  - Build: Webpack with separate entry points for popup, background, content

- [ ] **Task 1.2**: Authentication flow
  - Files: `src/background/auth.ts`, `src/shared/apiClient.ts`
  - OAuth2 flow with Auth Service
  - Token refresh logic (15min before expiry)
  - Token storage in memory (fallback encrypted local if needed)
  - Error handling for expired/invalid tokens

- [ ] **Task 1.3**: Basic popup UI
  - Files: `src/popup/App.tsx`, `src/popup/components/Controls.tsx`, `src/popup/components/PaymentSummary.tsx`
  - Start/Stop/Get Next Payment buttons
  - Payment summary card (vendor, amount, invoice, client)
  - Loading states

- [ ] **Task 1.4**: Background service worker setup
  - Files: `src/background/index.ts`, `src/background/stateMachine.ts`
  - State machine: IDLE → FETCHING → ACTIVE → COMPLETING → IDLE
  - Event listeners for popup messages
  - Storage sync handlers

#### Week 2: Payment Fetching & Queue Integration
- [ ] **Task 2.1**: Queue service passthrough (backend)
  - Files: `infra/queue-service/` (Pulumi + Cloud Run)
  - Endpoint: `GET /api/v1/queue/next-payment`
  - Headers: Authorization Bearer token
  - Returns: Payment object with portal info
  - Retry logic: 3 attempts with exponential backoff + jitter

- [ ] **Task 2.2**: Payment fetching in extension
  - Files: `src/background/queue.ts`
  - Long-poll queue service (30s timeout)
  - Parse response with Zod schema
  - Store payment in chrome.storage.session
  - Emit FETCHED_PAYMENT event

- [ ] **Task 2.3**: Payment Service integration
  - Files: `src/shared/apiClient.ts` (extend)
  - Endpoint: `GET /api/v1/payments/{paymentId}`
  - Fetch full payment details including PSOP portal info
  - Cache portal metadata

- [ ] **Task 2.4**: Popup payment display
  - Files: `src/popup/components/PaymentSummary.tsx` (enhance)
  - Display vendor, amount, invoice numbers, client name
  - Show portal URL if available
  - "Open Portal" button (opens in new tab)

#### Week 3: Portal Detection & Basic Content Scripts
- [ ] **Task 3.1**: Portal detection
  - Files: `src/content/portalDetect.ts`
  - URL pattern matching (host + path regex)
  - DOM fingerprinting (stable landmarks: form IDs, button text, meta tags)
  - Confidence scoring (0-1)
  - Store portalId + confidence in chrome.storage.session

- [ ] **Task 3.2**: Form field detection
  - Files: `src/content/formDetect.ts`
  - Field identification via label/for, name/id, aria-label
  - Proximity heuristics (label near input)
  - Field type inference (text, email, password, number, date)
  - Return field mapping: `{ selector: string, semanticType: string, confidence: number }`

- [ ] **Task 3.3**: Content script injection
  - Files: `src/content/index.ts`
  - Manifest host_permissions for known vendor domains
  - Dynamic injection on navigation (SPA-aware)
  - MutationObserver for DOM changes (debounced 500ms)
  - Portal detection on page load + navigation

- [ ] **Task 3.4**: Basic notification system
  - Files: `src/shared/events.ts`, `src/content/notifications.ts`
  - Notification type definitions
  - Event emission from content → background → popup
  - Popup notification banner component

#### Week 4: Autofill & Manual Flow
- [ ] **Task 4.1**: Autofill engine
  - Files: `src/content/autofill.ts`
  - Wait for DOM stability (500ms after last mutation)
  - Field mapping from payment data to form fields
  - Input event triggering (input, change, blur)
  - Confidence threshold check (default 0.7)
  - Emit NEXT_STEP_REQUIRED after autofill

- [ ] **Task 4.2**: Template system (client-side cache)
  - Files: `src/shared/selectors.ts`
  - Template structure: `{ portalId, pageKey, fields: FieldMapping[] }`
  - Store in chrome.storage.local (cached templates)
  - Template lookup by portalId + pageKey

- [ ] **Task 4.3**: Manual operator guidance
  - Files: `src/popup/components/Notifications.tsx` (enhance)
  - NEXT_STEP_REQUIRED notifications
  - "Form auto-filled. Click Submit." messages
  - Disable "Get Next Payment" during active payment

- [ ] **Task 4.4**: Exception creation
  - Files: `src/background/queue.ts` (extend)
  - Endpoint: `POST /api/v1/exceptions`
  - Create exception with paymentId + reason
  - Transition state to IDLE after exception

### Milestone 2: Learning Service + Enrichment (Weeks 5-7)

#### Week 5: Learning Mode
- [ ] **Task 5.1**: Portal Learning Service (backend)
  - Files: `infra/portal-learning-service/` (Pulumi + Cloud Run)
  - Endpoint: `POST /api/v1/portals/templates`
  - Schema: `{ portalId, accountId, clientId, vendorId, pageKey, fields: FieldMapping[], confidence }`
  - Storage: Firestore or Cloud SQL (indexed by portalId + accountId + clientId + vendorId)
  - Endpoint: `GET /api/v1/portals/templates?portalId=X&accountId=Y&clientId=Z&vendorId=W`

- [ ] **Task 5.2**: Learning capture in content script
  - Files: `src/content/learning.ts`
  - Capture field selectors + semantic types on form interaction
  - Track form submission → confirmation flow
  - Build learning payload (no sensitive values)
  - Submit to Portal Learning Service after confirmation

- [ ] **Task 5.3**: Template retrieval and application
  - Files: `src/content/autofill.ts` (extend)
  - Check Portal Learning Service for existing template
  - If found and confidence >= threshold → autofill
  - If not found → learning mode activated
  - Cache template in chrome.storage.local after fetch

- [ ] **Task 5.4**: Template versioning and signatures
  - Files: `src/shared/selectors.ts` (extend)
  - Backend signs templates with private key
  - Extension verifies signature with public key (env var)
  - Reject tampered templates

#### Week 6: Obfuscation & Security
- [ ] **Task 6.1**: Input obfuscation
  - Files: `src/content/obfuscate.ts`
  - Detect sensitive fields (credentials, MFA, SSN, Tax ID, bank, card)
  - Convert `type="text"` → `type="password"` for credentials
  - Apply CSS masking for other sensitive fields (visual overlay)
  - Whitelist: payment amount, invoice number (not sensitive)

- [ ] **Task 6.2**: Security hardening
  - Files: `manifest.json` (review permissions)
  - Minimize host_permissions (only vendor domains)
  - Content Security Policy strict
  - No eval, no inline scripts
  - Token never in URLs or logs

- [ ] **Task 6.3**: Error recovery
  - Files: `src/background/stateMachine.ts` (extend)
  - State: TEMPLATE_MISMATCH, EXCEPTION, BLOCKED_AUTOMATION
  - Recovery flows for each error state
  - Operator can retry or create exception

#### Week 7: Evidence Capture
- [ ] **Task 7.1**: Screenshot capture
  - Files: `src/content/scrape.ts`
  - Detect confirmation page (URL pattern + DOM markers)
  - Trigger `chrome.tabs.captureVisibleTab` via background
  - Convert to base64 or blob
  - Emit AUTO_ACTION_IN_PROGRESS notification

- [ ] **Task 7.2**: Evidence upload
  - Files: `src/background/evidence.ts`
  - Get pre-signed URL from Evidence Service
  - Upload screenshot to GCS via fetch PUT
  - Retry on failure (3 attempts)
  - Emit AUTO_ACTION_COMPLETE or ERROR notification

- [ ] **Task 7.3**: Metadata scraping
  - Files: `src/content/scrape.ts` (extend)
  - Scrape confirmation number, invoice numbers, amount, timestamp, payment method
  - Use selectors from template or heuristics
  - Build metadata payload
  - POST to Evidence Service metadata endpoint

- [ ] **Task 7.4**: Payment completion
  - Files: `src/background/queue.ts` (extend)
  - Mark payment complete in Queue Service
  - Clear chrome.storage.session
  - Transition to IDLE (or FETCHING if "Stop After Next" not set)
  - Emit success notification

### Milestone 3: Telemetry + Analytics (Weeks 8-9)

#### Week 8: Telemetry Infrastructure
- [ ] **Task 8.1**: Telemetry Service / BigQuery setup
  - Files: `infra/telemetry/` (Pulumi)
  - BigQuery dataset: `payclearly_extension_telemetry`
  - Table: `events` (partitioned by date)
  - Schema: event_type, timestamp, operator_id, payment_id, portal_id, page_key, metadata (JSON)
  - Cloud Run service for HTTP ingestion (optional alternative)

- [ ] **Task 8.2**: Telemetry client
  - Files: `src/background/telemetry.ts`
  - Event batching (buffer 10 events or 30s, whichever first)
  - POST to Telemetry Service or BigQuery streaming insert
  - Events: payment_fetched, portal_detected, autofill_attempted, autofill_succeeded, confirmation_detected, evidence_uploaded, exception_created, error

- [ ] **Task 8.3**: Timing tracking
  - Files: `src/shared/types.ts` (extend PaymentState)
  - Track: payment_received_at, first_portal_interaction_at, confirmation_detected_at, payment_completed_at
  - Include in telemetry events

- [ ] **Task 8.4**: Error telemetry
  - Files: `src/shared/logger.ts`
  - Structured logging with context
  - Error events include stack traces (sanitized)
  - Telemetry for recoverable vs non-recoverable errors

#### Week 9: Analytics & Monitoring
- [ ] **Task 9.1**: Dashboard queries (BigQuery)
  - Files: `infra/telemetry/queries/` (optional SQL files)
  - Median completion time by portal
  - Autofill success rate by portal
  - Error rates by type
  - Operator throughput

- [ ] **Task 9.2**: Popup analytics display (optional)
  - Files: `src/popup/components/Stats.tsx` (optional)
  - Show operator's today stats (payments completed, avg time)
  - Only if backend provides aggregated data

- [ ] **Task 9.3**: Health checks
  - Files: `src/background/health.ts`
  - Periodic health check to backend
  - Detect extension version mismatches
  - Alert operator if backend unavailable

---

## 3. File-by-File Implementation Order

### Phase 1: Foundation (Days 1-3)
1. `package.json` - Dependencies
2. `tsconfig.json` - TypeScript config
3. `webpack.config.js` - Build config
4. `manifest.json` - Extension manifest
5. `src/shared/types.ts` - Core type definitions
6. `src/shared/logger.ts` - Logging utility
7. `src/shared/apiClient.ts` - HTTP client
8. `src/shared/events.ts` - Event types

### Phase 2: Background Worker (Days 4-6)
9. `src/background/index.ts` - Service worker entry
10. `src/background/auth.ts` - Authentication
11. `src/background/stateMachine.ts` - State machine
12. `src/background/queue.ts` - Payment fetching
13. `src/background/evidence.ts` - Evidence upload

### Phase 3: Content Scripts (Days 7-10)
14. `src/content/index.ts` - Content script entry
15. `src/content/portalDetect.ts` - Portal detection
16. `src/content/formDetect.ts` - Form detection
17. `src/content/autofill.ts` - Autofill engine
18. `src/content/notifications.ts` - Notification emission

### Phase 4: Popup UI (Days 11-13)
19. `src/popup/App.tsx` - Main popup component
20. `src/popup/components/Controls.tsx` - Control buttons
21. `src/popup/components/PaymentSummary.tsx` - Payment display
22. `src/popup/components/Notifications.tsx` - Notification banner
23. `src/popup/state/useExtensionState.ts` - State hook

### Phase 5: Learning & Enrichment (Days 14-18)
24. `src/content/learning.ts` - Learning mode
25. `src/content/obfuscate.ts` - Input obfuscation
26. `src/content/scrape.ts` - Evidence scraping
27. `src/shared/selectors.ts` - Template utilities
28. `src/background/telemetry.ts` - Telemetry

### Phase 6: Backend Services (Days 19-25)
29. `infra/queue-service/main.go` or `main.py` - Queue passthrough
30. `infra/queue-service/Pulumi.yaml` - Pulumi config
31. `infra/portal-learning-service/main.go` or `main.py` - Learning service
32. `infra/portal-learning-service/Pulumi.yaml` - Pulumi config
33. `infra/telemetry/Pulumi.yaml` - BigQuery setup

---

## 4. Risk List and Mitigations

### Risk 1: Portal Fragility (High)
**Description**: Vendor portals change selectors, break autofill
**Impact**: High - Autofill fails, operator must manually fill
**Mitigation**:
- Confidence thresholds (don't autofill if < 0.7)
- Learning mode captures new selectors automatically
- Template versioning with fallback to manual
- Operator can disable autofill per portal
- Monitoring: track autofill success rate, alert on drops

### Risk 2: SPA Navigation Detection (Medium)
**Description**: Single-page apps don't trigger navigation events
**Mitigation**:
- MutationObserver for DOM changes (debounced)
- URL change detection via `popstate` and `pushState` interception
- Portal detection re-runs on significant DOM mutations
- Timeout fallback: re-detect every 5s if no portal detected

### Risk 3: Token Expiry During Payment (Medium)
**Description**: Access token expires mid-payment flow
**Impact**: Medium - Payment fails, operator must restart
**Mitigation**:
- Proactive refresh (15min before expiry)
- Background worker monitors token age
- Retry with refresh on 401 responses
- Store refresh token securely (encrypted local fallback)

### Risk 4: Evidence Upload Failure (Medium)
**Description**: Screenshot upload fails, payment marked complete without evidence
**Impact**: Medium - Compliance risk, missing audit trail
**Mitigation**:
- Retry upload 3 times with exponential backoff
- Store screenshot locally (chrome.storage.local, max 5MB) if upload fails
- Operator notification: "Evidence upload failed. Retry?"
- Payment not marked complete until evidence confirmed
- Fallback: operator can manually upload screenshot

### Risk 5: Template Tampering (Low)
**Description**: Malicious template injection
**Mitigation**:
- Template signatures (RSA, verified client-side)
- Server-side validation of template structure
- PortalId validated against payment data
- No sensitive data in templates (only selectors + semantic types)

### Risk 6: Service Worker Restart (Low)
**Description**: Chrome kills service worker, state lost
**Mitigation**:
- State persisted in chrome.storage.session
- State machine recovers from storage on startup
- Payment context restored from storage
- Long-running operations checkpointed

### Risk 7: Captcha Detection (Medium)
**Description**: Autofill triggers captcha, operator blocked
**Mitigation**:
- Detect captcha presence (iframe, challenge divs)
- Emit WARNING notification: "Captcha detected. Please solve manually."
- Skip autofill on pages with captcha
- Learning mode: mark page as "captcha_required" in template

### Risk 8: Performance Degradation (Low)
**Description**: MutationObservers slow down portal pages
**Mitigation**:
- Debounce observers (500ms)
- Throttle portal detection (max once per 2s)
- Unobserve after portal detected and autofill complete
- Lightweight selectors (avoid deep DOM traversal)

---

## 5. Test Plan

### 5.1 Unit Tests

**Portal Detection**
- Test URL pattern matching (exact, regex, wildcard)
- Test DOM fingerprinting (stable landmarks)
- Test confidence scoring
- Test portalId resolution

**Form Detection**
- Test field identification (label/for, name/id, aria-label)
- Test proximity heuristics
- Test field type inference
- Test selector resolution (CSS, XPath fallback)

**Autofill**
- Test input event triggering (input, change, blur)
- Test confidence threshold enforcement
- Test field mapping (payment data → form fields)
- Test SPA navigation handling

**State Machine**
- Test state transitions (IDLE → FETCHING → ACTIVE → COMPLETING → IDLE)
- Test error state transitions (TEMPLATE_MISMATCH, EXCEPTION, BLOCKED_AUTOMATION)
- Test recovery flows
- Test state persistence and restoration

**Learning**
- Test selector capture
- Test learning payload generation (no sensitive data)
- Test template submission

**Obfuscation**
- Test sensitive field detection
- Test type conversion (text → password)
- Test CSS masking application

### 5.2 Integration Tests

**End-to-End Payment Flow**
- Mock backend services (Auth, Queue, Payment, Evidence)
- Test: Fetch payment → Detect portal → Autofill → Capture evidence → Complete
- Test error scenarios (token expiry, upload failure, portal mismatch)

**Content Script + Background Communication**
- Test message passing (content → background → popup)
- Test notification emission and display
- Test state synchronization

**Template System**
- Test template retrieval from Portal Learning Service
- Test template caching in chrome.storage.local
- Test template signature verification
- Test template application and autofill

### 5.3 Manual Testing Checklist

**MVP Testing**
- [ ] Authenticate operator
- [ ] Fetch next payment
- [ ] Open portal URL
- [ ] Detect portal (known and unknown)
- [ ] Autofill form (if template exists)
- [ ] Manual CTA clicks work
- [ ] Detect confirmation page
- [ ] Capture screenshot
- [ ] Upload evidence
- [ ] Mark payment complete
- [ ] Fetch next payment automatically

**Learning Mode Testing**
- [ ] Unknown portal → learning mode activated
- [ ] Capture form selectors
- [ ] Submit learning payload after confirmation
- [ ] Next payment on same portal → template applied

**Error Scenarios**
- [ ] Token expiry during payment
- [ ] Evidence upload failure
- [ ] Portal detection failure
- [ ] Template mismatch (low confidence)
- [ ] Captcha detection
- [ ] Service worker restart

**Performance Testing**
- [ ] Autofill completes < 500ms after form stable
- [ ] No noticeable lag on portal pages
- [ ] Memory usage < 50MB
- [ ] Storage usage < 10MB

---

## 6. Success Criteria

### MVP (Milestone 1)
- Operator can authenticate and fetch payments
- Portal detection works for 3+ test portals
- Autofill works when template exists
- Evidence capture and upload works
- Payment completion flow works end-to-end

### Learning Service (Milestone 2)
- Learning mode captures templates automatically
- Templates retrieved and applied on subsequent payments
- Obfuscation works for sensitive fields
- Security requirements met (signatures, validation)

### Telemetry (Milestone 3)
- All key events telemetried
- Timing data captured accurately
- BigQuery queries return analytics
- Dashboard shows completion times and success rates

---

## 7. Deployment Strategy

### Extension Distribution
- Internal-only: Enterprise managed extension or private Chrome Web Store
- Versioning: Semantic versioning (1.0.0, 1.1.0, etc.)
- Update mechanism: Chrome auto-updates from store
- Rollback: Previous version available in store

### Backend Services
- Cloud Run services (auto-scaling, 0-1 instances for cost)
- Environment-specific stacks (dev, test, staging, prod)
- Pulumi manages infrastructure
- CI/CD: GitHub Actions or Cloud Build

### Configuration
- Extension: Environment-specific build (dev/staging/prod)
- Backend: Pulumi config per stack
- Secrets: Google Secret Manager
- Feature flags: Backend-controlled (optional)

---

## 8. Monitoring & Observability

### Extension Metrics
- Payment completion time (p50, p95, p99)
- Autofill success rate
- Evidence upload success rate
- Error rates by type
- Operator throughput

### Backend Metrics
- API latency (p50, p95, p99)
- Error rates (4xx, 5xx)
- Queue depth
- Template cache hit rate

### Alerts
- Evidence upload failure rate > 1%
- Autofill success rate drops > 20%
- Payment completion time p95 > 5min
- Backend service errors > 1%

---

## 9. Future Enhancements (Post-MVP)

1. **Multi-tab support**: Handle multiple payments in parallel tabs
2. **Advanced learning**: ML-based field detection
3. **Portal-specific optimizations**: Custom logic per major vendor
4. **Operator training mode**: Guided tutorials for new operators
5. **Analytics dashboard**: Real-time operator performance
6. **A/B testing**: Test autofill strategies
7. **Voice notifications**: Audio alerts for next steps
8. **Keyboard shortcuts**: Power-user shortcuts for common actions

