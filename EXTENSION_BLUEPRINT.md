# Extension Implementation Blueprint

## 1. Manifest V3 Configuration

### manifest.json Structure

```json
{
  "manifest_version": 3,
  "name": "PayClearly Payment Accelerator",
  "version": "1.0.0",
  "description": "Internal extension for accelerating concierge AP portal payments",

  "permissions": [
    "storage",
    "tabs",
    "activeTab",
    "scripting",
    "identity"
  ],

  "host_permissions": [
    "https://*.payclearly.com/*",
    "https://*.payclearly.internal/*"
  ],

  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },

  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],

  "web_accessible_resources": [
    {
      "resources": ["icons/*"],
      "matches": ["<all_urls>"]
    }
  ],

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },

  "oauth2": {
    "client_id": "${OAUTH_CLIENT_ID}",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
}
```

### Host Permissions Strategy

**Initial Approach**: Minimal host_permissions
- Only PayClearly backend domains
- Vendor portal domains added dynamically via `chrome.scripting.updateContentScripts` when payment fetched
- Or: Use `<all_urls>` with runtime host permission prompts (not ideal for internal tool)

**Recommended**: Start with `<all_urls>` for MVP, restrict later
- Internal-only distribution reduces security risk
- Easier development and testing
- Can refine host_permissions per vendor in production

---

## 2. Background Service Worker State Machine

### State Definitions

```typescript
export type ExtensionState =
  | "IDLE"
  | "FETCHING"
  | "ACTIVE"
  | "COMPLETING"
  | "LEARNING"
  | "TEMPLATE_MISMATCH"
  | "EXCEPTION"
  | "BLOCKED_AUTOMATION";

export interface StateContext {
  state: ExtensionState;
  payment: Payment | null;
  portalId: string | null;
  pageKey: string | null;
  template: PortalTemplate | null;
  error: Error | null;
  timestamps: {
    paymentReceivedAt: string | null;
    firstPortalInteractionAt: string | null;
    confirmationDetectedAt: string | null;
    paymentCompletedAt: string | null;
  };
}
```

### State Machine Pseudocode

```
INITIAL STATE: IDLE

IDLE:
  - On "GET_NEXT_PAYMENT" message:
    - Transition to FETCHING
    - Call queueService.getNextPayment()
    - On success: Store payment, transition to ACTIVE
    - On error: Emit ERROR notification, stay IDLE

FETCHING:
  - Poll queue service (long-poll 30s)
  - On payment received:
    - Store in chrome.storage.session
    - Fetch full payment details from Payment Service
    - Check Portal Learning Service for template
    - Transition to ACTIVE
  - On error (retry 3x):
    - If retries exhausted: Transition to IDLE, emit ERROR
    - Else: Retry with exponential backoff

ACTIVE:
  - Wait for content script portal detection
  - On portal detected:
    - If template exists and confidence >= threshold:
      - Trigger autofill
      - Emit NEXT_STEP_REQUIRED: "Form auto-filled. Click Submit."
    - Else if template missing:
      - Transition to LEARNING
      - Emit NEXT_STEP_REQUIRED: "Learning mode. Please fill form manually."
  - On confirmation detected:
    - Transition to COMPLETING
    - Emit AUTO_ACTION_IN_PROGRESS: "Capturing evidence..."

LEARNING:
  - Capture form selectors and field mappings
  - On form submission:
    - Build learning payload
    - Wait for confirmation
  - On confirmation detected:
    - Submit learning payload to Portal Learning Service
    - Transition to COMPLETING
    - Emit AUTO_ACTION_COMPLETE: "Template learned. Capturing evidence..."

COMPLETING:
  - Capture screenshot (chrome.tabs.captureVisibleTab)
  - Get pre-signed URL from Evidence Service
  - Upload screenshot to GCS
  - Scrape confirmation metadata
  - POST metadata to Evidence Service
  - Mark payment complete in Queue Service
  - Clear chrome.storage.session
  - If "Stop After Next" not set:
    - Transition to FETCHING (get next payment)
  - Else:
    - Transition to IDLE
  - Emit AUTO_ACTION_COMPLETE: "Payment completed. Evidence uploaded."

TEMPLATE_MISMATCH:
  - Portal detected but template confidence < threshold
  - Emit WARNING: "Template confidence low. Please verify fields."
  - Operator can: Retry autofill, Continue manually, Create exception
  - On operator action: Transition to ACTIVE or EXCEPTION

EXCEPTION:
  - Operator created exception
  - POST to Exception Service
  - Clear payment state
  - Transition to IDLE
  - Emit AUTO_ACTION_COMPLETE: "Exception created. Payment parked."

BLOCKED_AUTOMATION:
  - Captcha detected or automation blocked
  - Emit WARNING: "Automation blocked. Please solve manually."
  - Operator must complete manually
  - On confirmation: Transition to COMPLETING
```

### State Persistence

```typescript
// On state change, persist to chrome.storage.session
async function persistState(context: StateContext) {
  await chrome.storage.session.set({ stateContext: context });
}

// On service worker startup, restore from storage
async function restoreState(): Promise<StateContext | null> {
  const result = await chrome.storage.session.get("stateContext");
  return result.stateContext || null;
}
```

---

## 3. Content Script Strategy

### Portal Detection Flow

```typescript
// portalDetect.ts

interface PortalDetectionResult {
  portalId: string;
  confidence: number;
  pageKey: string;
  url: string;
  fingerprint: string;
}

async function detectPortal(): Promise<PortalDetectionResult | null> {
  // 1. Check URL patterns
  const urlMatch = matchUrlPatterns(window.location.href);
  if (urlMatch) {
    return {
      portalId: urlMatch.portalId,
      confidence: 0.9,
      pageKey: urlMatch.pageKey,
      url: window.location.href,
      fingerprint: generateFingerprint()
    };
  }

  // 2. DOM fingerprinting
  const fingerprint = generateFingerprint();
  const domMatch = matchDomFingerprint(fingerprint);
  if (domMatch && domMatch.confidence >= 0.7) {
    return {
      portalId: domMatch.portalId,
      confidence: domMatch.confidence,
      pageKey: domMatch.pageKey,
      url: window.location.href,
      fingerprint
    };
  }

  // 3. Backend portalId from payment (if available)
  const payment = await getCurrentPayment();
  if (payment?.portalId) {
    return {
      portalId: payment.portalId,
      confidence: 0.6, // Lower confidence, needs verification
      pageKey: inferPageKey(),
      url: window.location.href,
      fingerprint
    };
  }

  return null;
}

function generateFingerprint(): string {
  // Stable landmarks: form IDs, button text, meta tags, title patterns
  const landmarks = [
    document.querySelector('form')?.id,
    document.querySelector('form')?.action,
    Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).join('|'),
    document.querySelector('meta[name="description"]')?.getAttribute('content'),
    document.title
  ].filter(Boolean).join('||');

  return btoa(landmarks).substring(0, 32);
}
```

### Form Detection Flow

```typescript
// formDetect.ts

interface FieldMapping {
  selector: string;
  semanticType: "amount" | "invoice_number" | "account_number" | "routing_number" | "card_number" | "expiry" | "cvv" | "email" | "phone" | "date" | "text";
  confidence: number;
  inputType: string;
}

async function detectFormFields(): Promise<FieldMapping[]> {
  const fields: FieldMapping[] = [];
  const form = document.querySelector('form');
  if (!form) return fields;

  // Wait for DOM stability
  await waitForStableDOM(500);

  const inputs = form.querySelectorAll('input, select, textarea');

  for (const input of inputs) {
    const mapping = identifyField(input as HTMLElement);
    if (mapping) {
      fields.push(mapping);
    }
  }

  return fields;
}

function identifyField(element: HTMLElement): FieldMapping | null {
  // 1. Check label/for relationship
  const label = findLabel(element);
  if (label) {
    const semanticType = inferSemanticType(label.textContent || '');
    if (semanticType) {
      return {
        selector: generateSelector(element),
        semanticType,
        confidence: 0.8,
        inputType: (element as HTMLInputElement).type || 'text'
      };
    }
  }

  // 2. Check name/id/aria-label
  const name = (element as HTMLInputElement).name || element.id || element.getAttribute('aria-label') || '';
  const semanticType = inferSemanticType(name);
  if (semanticType) {
    return {
      selector: generateSelector(element),
      semanticType,
      confidence: 0.7,
      inputType: (element as HTMLInputElement).type || 'text'
    };
  }

  // 3. Proximity heuristics (label near input)
  const nearbyLabel = findNearbyLabel(element);
  if (nearbyLabel) {
    const semanticType = inferSemanticType(nearbyLabel.textContent || '');
    if (semanticType) {
      return {
        selector: generateSelector(element),
        semanticType,
        confidence: 0.6,
        inputType: (element as HTMLInputElement).type || 'text'
      };
    }
  }

  return null;
}

function inferSemanticType(text: string): FieldMapping['semanticType'] | null {
  const lower = text.toLowerCase();
  if (lower.match(/amount|total|payment|price|cost/)) return "amount";
  if (lower.match(/invoice|inv#|invoice number/)) return "invoice_number";
  if (lower.match(/account.*number|account#/)) return "account_number";
  if (lower.match(/routing|routing number|aba/)) return "routing_number";
  if (lower.match(/card.*number|card#|credit card/)) return "card_number";
  if (lower.match(/expir|exp date|mm\/yy/)) return "expiry";
  if (lower.match(/cvv|cvc|security code/)) return "cvv";
  if (lower.match(/email|e-mail/)) return "email";
  if (lower.match(/phone|tel/)) return "phone";
  if (lower.match(/date/)) return "date";
  return "text";
}
```

### Autofill Flow

```typescript
// autofill.ts

async function autofillForm(
  payment: Payment,
  template: PortalTemplate
): Promise<{ success: boolean; fieldsFilled: number; errors: string[] }> {
  const form = document.querySelector('form');
  if (!form) {
    return { success: false, fieldsFilled: 0, errors: ['Form not found'] };
  }

  // Wait for DOM stability
  await waitForStableDOM(500);

  let fieldsFilled = 0;
  const errors: string[] = [];

  for (const fieldMapping of template.fields) {
    const element = document.querySelector(fieldMapping.selector) as HTMLInputElement;
    if (!element) {
      errors.push(`Field not found: ${fieldMapping.selector}`);
      continue;
    }

    // Get value from payment data
    const value = getPaymentValue(payment, fieldMapping.semanticType);
    if (!value) {
      continue; // Skip if no value available
    }

    // Fill field
    try {
      fillField(element, value);
      fieldsFilled++;
    } catch (error) {
      errors.push(`Failed to fill ${fieldMapping.selector}: ${error}`);
    }
  }

  // Emit notification
  chrome.runtime.sendMessage({
    type: 'NOTIFICATION',
    notification: {
      type: 'NEXT_STEP_REQUIRED',
      messageKey: 'AUTOFILL_COMPLETE',
      humanMessage: `Form auto-filled (${fieldsFilled} fields). Click Submit.`,
      blocking: true
    }
  });

  return { success: fieldsFilled > 0, fieldsFilled, errors };
}

function fillField(element: HTMLInputElement, value: string) {
  // Set value
  element.value = value;

  // Trigger events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));

  // Focus and blur to ensure React/Vue bindings update
  element.focus();
  element.blur();
}

function getPaymentValue(payment: Payment, semanticType: FieldMapping['semanticType']): string | null {
  switch (semanticType) {
    case 'amount':
      return payment.amount?.toString() || null;
    case 'invoice_number':
      return payment.invoiceNumbers?.[0] || null;
    case 'account_number':
      return payment.virtualCard?.accountNumber || null;
    case 'routing_number':
      return payment.virtualCard?.routingNumber || null;
    case 'card_number':
      return payment.virtualCard?.cardNumber || null;
    case 'expiry':
      return payment.virtualCard?.expiry || null;
    case 'cvv':
      return payment.virtualCard?.cvv || null;
    default:
      return null;
  }
}
```

### Learning Mode Flow

```typescript
// learning.ts

interface LearningPayload {
  portalId: string;
  accountId: string;
  clientId: string;
  vendorId: string;
  pageKey: string;
  fields: Array<{
    selector: string;
    semanticType: string;
    inputType: string;
    label?: string;
  }>;
  confidence: number;
  url: string;
  fingerprint: string;
}

let learningMode = false;
let capturedFields: FieldMapping[] = [];

async function startLearningMode() {
  learningMode = true;
  capturedFields = [];

  // Observe form interactions
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('input', captureField, true);
    form.addEventListener('change', captureField, true);
  }
}

function captureField(event: Event) {
  const element = event.target as HTMLElement;
  const mapping = identifyField(element);
  if (mapping && !capturedFields.find(f => f.selector === mapping.selector)) {
    capturedFields.push(mapping);
  }
}

async function submitLearning(payment: Payment): Promise<void> {
  if (!learningMode || capturedFields.length === 0) {
    return;
  }

  const payload: LearningPayload = {
    portalId: payment.portalId,
    accountId: payment.accountId,
    clientId: payment.clientId,
    vendorId: payment.vendorId,
    pageKey: inferPageKey(),
    fields: capturedFields.map(f => ({
      selector: f.selector,
      semanticType: f.semanticType,
      inputType: f.inputType,
      label: findLabel(document.querySelector(f.selector) as HTMLElement)?.textContent || undefined
    })),
    confidence: calculateConfidence(capturedFields),
    url: window.location.href,
    fingerprint: generateFingerprint()
  };

  // Submit to Portal Learning Service
  await fetch(`${PORTAL_LEARNING_SERVICE_URL}/api/v1/portals/templates`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  learningMode = false;
}
```

### Obfuscation Flow

```typescript
// obfuscate.ts

const SENSITIVE_SEMANTIC_TYPES = [
  'account_number',
  'routing_number',
  'card_number',
  'cvv',
  'email',
  'phone'
];

const SENSITIVE_KEYWORDS = [
  'password',
  'pin',
  'ssn',
  'social security',
  'tax id',
  'ein',
  'mfa',
  '2fa',
  'secret',
  'credential'
];

async function obfuscateSensitiveFields() {
  const form = document.querySelector('form');
  if (!form) return;

  const inputs = form.querySelectorAll('input[type="text"]');

  for (const input of inputs) {
    const element = input as HTMLInputElement;
    const isSensitive = isSensitiveField(element);

    if (isSensitive) {
      // Convert to password type
      element.type = 'password';

      // Or apply CSS masking (for fields that shouldn't be password type)
      // element.style.webkitTextSecurity = 'disc';
    }
  }
}

function isSensitiveField(element: HTMLInputElement): boolean {
  // Check semantic type
  const mapping = identifyField(element);
  if (mapping && SENSITIVE_SEMANTIC_TYPES.includes(mapping.semanticType)) {
    return true;
  }

  // Check field name/label
  const name = (element.name || element.id || element.getAttribute('aria-label') || '').toLowerCase();
  if (SENSITIVE_KEYWORDS.some(keyword => name.includes(keyword))) {
    return true;
  }

  return false;
}
```

### Confirmation Detection & Evidence Capture

```typescript
// scrape.ts

interface ConfirmationMetadata {
  confirmationNumber: string | null;
  invoiceNumbers: string[];
  amount: number | null;
  timestamp: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
}

async function detectConfirmation(): Promise<boolean> {
  // Check URL patterns
  if (window.location.href.match(/confirm|success|complete|thank.*you/i)) {
    return true;
  }

  // Check DOM markers
  const markers = [
    'confirmation',
    'success',
    'payment.*complete',
    'thank.*you',
    'transaction.*id',
    'reference.*number'
  ];

  const bodyText = document.body.textContent || '';
  if (markers.some(marker => new RegExp(marker, 'i').test(bodyText))) {
    return true;
  }

  return false;
}

async function scrapeConfirmationMetadata(): Promise<ConfirmationMetadata> {
  const metadata: ConfirmationMetadata = {
    confirmationNumber: null,
    invoiceNumbers: [],
    amount: null,
    timestamp: null,
    paymentMethod: null,
    transactionId: null
  };

  // Scrape confirmation number
  const confirmationPatterns = [
    /confirmation.*number[:\s]+([A-Z0-9-]+)/i,
    /reference.*number[:\s]+([A-Z0-9-]+)/i,
    /transaction.*id[:\s]+([A-Z0-9-]+)/i
  ];

  const bodyText = document.body.textContent || '';
  for (const pattern of confirmationPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      metadata.confirmationNumber = match[1];
      break;
    }
  }

  // Scrape amount
  const amountPattern = /\$?([\d,]+\.\d{2})/g;
  const amounts = Array.from(bodyText.matchAll(amountPattern));
  if (amounts.length > 0) {
    metadata.amount = parseFloat(amounts[amounts.length - 1][1].replace(/,/g, ''));
  }

  // Scrape timestamp
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/;
  const dateMatch = bodyText.match(datePattern);
  if (dateMatch) {
    metadata.timestamp = dateMatch[1];
  }

  // Emit trigger to background for screenshot
  chrome.runtime.sendMessage({
    type: 'CONFIRMATION_DETECTED',
    metadata
  });

  return metadata;
}
```

---

## 4. Notification Catalog

### Notification Types & Triggers

```typescript
// Notification catalog with message keys

export const NOTIFICATION_CATALOG = {
  // NEXT_STEP_REQUIRED
  AUTOFILL_COMPLETE: {
    type: 'NEXT_STEP_REQUIRED',
    messageKey: 'AUTOFILL_COMPLETE',
    humanMessage: 'Form auto-filled. Click Submit.',
    blocking: true
  },
  CAPTCHA_DETECTED: {
    type: 'NEXT_STEP_REQUIRED',
    messageKey: 'CAPTCHA_DETECTED',
    humanMessage: 'Captcha detected. Please solve manually.',
    blocking: true
  },
  LEARNING_MODE: {
    type: 'NEXT_STEP_REQUIRED',
    messageKey: 'LEARNING_MODE',
    humanMessage: 'Learning mode. Please fill form manually.',
    blocking: false
  },

  // AUTO_ACTION_IN_PROGRESS
  CAPTURING_EVIDENCE: {
    type: 'AUTO_ACTION_IN_PROGRESS',
    messageKey: 'CAPTURING_EVIDENCE',
    humanMessage: 'Capturing screenshot...',
    blocking: true
  },
  UPLOADING_EVIDENCE: {
    type: 'AUTO_ACTION_IN_PROGRESS',
    messageKey: 'UPLOADING_EVIDENCE',
    humanMessage: 'Uploading evidence...',
    blocking: true
  },
  FETCHING_PAYMENT: {
    type: 'AUTO_ACTION_IN_PROGRESS',
    messageKey: 'FETCHING_PAYMENT',
    humanMessage: 'Fetching next payment...',
    blocking: true
  },

  // AUTO_ACTION_COMPLETE
  EVIDENCE_UPLOADED: {
    type: 'AUTO_ACTION_COMPLETE',
    messageKey: 'EVIDENCE_UPLOADED',
    humanMessage: 'Evidence uploaded. Ready.',
    blocking: false
  },
  PAYMENT_COMPLETED: {
    type: 'AUTO_ACTION_COMPLETE',
    messageKey: 'PAYMENT_COMPLETED',
    humanMessage: 'Payment completed. Evidence uploaded.',
    blocking: false
  },
  TEMPLATE_LEARNED: {
    type: 'AUTO_ACTION_COMPLETE',
    messageKey: 'TEMPLATE_LEARNED',
    humanMessage: 'Template learned. Capturing evidence...',
    blocking: false
  },
  EXCEPTION_CREATED: {
    type: 'AUTO_ACTION_COMPLETE',
    messageKey: 'EXCEPTION_CREATED',
    humanMessage: 'Exception created. Payment parked.',
    blocking: false
  },

  // WARNING
  TEMPLATE_LOW_CONFIDENCE: {
    type: 'WARNING',
    messageKey: 'TEMPLATE_LOW_CONFIDENCE',
    humanMessage: 'Template confidence low. Please verify fields.',
    blocking: false
  },
  TEMPLATE_MISMATCH: {
    type: 'WARNING',
    messageKey: 'TEMPLATE_MISMATCH',
    humanMessage: 'Template mismatch detected. Please verify.',
    blocking: false
  },

  // ERROR
  TOKEN_EXPIRED: {
    type: 'ERROR',
    messageKey: 'TOKEN_EXPIRED',
    humanMessage: 'Authentication expired. Please refresh.',
    blocking: true
  },
  EVIDENCE_UPLOAD_FAILED: {
    type: 'ERROR',
    messageKey: 'EVIDENCE_UPLOAD_FAILED',
    humanMessage: 'Evidence upload failed. Retry?',
    blocking: true
  },
  PAYMENT_FETCH_FAILED: {
    type: 'ERROR',
    messageKey: 'PAYMENT_FETCH_FAILED',
    humanMessage: 'Failed to fetch payment. Retry?',
    blocking: true
  },
  PORTAL_DETECTION_FAILED: {
    type: 'ERROR',
    messageKey: 'PORTAL_DETECTION_FAILED',
    humanMessage: 'Portal detection failed. Please continue manually.',
    blocking: false
  }
};
```

---

## 5. Data Model Definitions

### TypeScript Types

```typescript
// src/shared/types.ts

export interface Payment {
  id: string;
  accountId: string;
  clientId: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  currency: string;
  invoiceNumbers: string[];
  portalId: string | null;
  portalUrl: string | null;
  virtualCard: {
    cardNumber: string;
    expiry: string;
    cvv: string;
    accountNumber?: string;
    routingNumber?: string;
  };
  metadata: Record<string, unknown>;
}

export interface PortalTemplate {
  portalId: string;
  accountId: string;
  clientId: string;
  vendorId: string;
  pageKey: string;
  fields: FieldMapping[];
  confidence: number;
  version: number;
  signature: string; // RSA signature for verification
  createdAt: string;
  updatedAt: string;
}

export interface FieldMapping {
  selector: string;
  semanticType: "amount" | "invoice_number" | "account_number" | "routing_number" | "card_number" | "expiry" | "cvv" | "email" | "phone" | "date" | "text";
  inputType: string;
  label?: string;
  confidence: number;
}

export interface ExtensionNotification {
  type: NotificationType;
  messageKey: string;
  humanMessage: string;
  paymentId?: string;
  portalId?: string;
  pageKey?: string;
  confidence?: number;
  blocking?: boolean;
  timestamp: string;
}

export type NotificationType =
  | "NEXT_STEP_REQUIRED"
  | "AUTO_ACTION_IN_PROGRESS"
  | "AUTO_ACTION_COMPLETE"
  | "WARNING"
  | "ERROR";

export interface StateContext {
  state: ExtensionState;
  payment: Payment | null;
  portalId: string | null;
  pageKey: string | null;
  template: PortalTemplate | null;
  error: Error | null;
  timestamps: {
    paymentReceivedAt: string | null;
    firstPortalInteractionAt: string | null;
    confirmationDetectedAt: string | null;
    paymentCompletedAt: string | null;
  };
}

export type ExtensionState =
  | "IDLE"
  | "FETCHING"
  | "ACTIVE"
  | "COMPLETING"
  | "LEARNING"
  | "TEMPLATE_MISMATCH"
  | "EXCEPTION"
  | "BLOCKED_AUTOMATION";
```

### Zod Schemas

```typescript
// src/shared/schemas.ts

import { z } from 'zod';

export const PaymentSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  clientId: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  amount: z.number(),
  currency: z.string(),
  invoiceNumbers: z.array(z.string()),
  portalId: z.string().nullable(),
  portalUrl: z.string().nullable(),
  virtualCard: z.object({
    cardNumber: z.string(),
    expiry: z.string(),
    cvv: z.string(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional()
  }),
  metadata: z.record(z.unknown())
});

export const PortalTemplateSchema = z.object({
  portalId: z.string(),
  accountId: z.string(),
  clientId: z.string(),
  vendorId: z.string(),
  pageKey: z.string(),
  fields: z.array(z.object({
    selector: z.string(),
    semanticType: z.enum(["amount", "invoice_number", "account_number", "routing_number", "card_number", "expiry", "cvv", "email", "phone", "date", "text"]),
    inputType: z.string(),
    label: z.string().optional(),
    confidence: z.number()
  })),
  confidence: z.number(),
  version: z.number(),
  signature: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ExtensionNotificationSchema = z.object({
  type: z.enum(["NEXT_STEP_REQUIRED", "AUTO_ACTION_IN_PROGRESS", "AUTO_ACTION_COMPLETE", "WARNING", "ERROR"]),
  messageKey: z.string(),
  humanMessage: z.string(),
  paymentId: z.string().optional(),
  portalId: z.string().optional(),
  pageKey: z.string().optional(),
  confidence: z.number().optional(),
  blocking: z.boolean().optional(),
  timestamp: z.string()
});
```

---

## 6. Environment Variables

### Extension Build-Time Variables

```typescript
// src/shared/config.ts

export const config = {
  authServiceUrl: process.env.AUTH_SERVICE_URL || '',
  queueServiceUrl: process.env.QUEUE_SERVICE_URL || '',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || '',
  portalLearningServiceUrl: process.env.PORTAL_LEARNING_SERVICE_URL || '',
  exceptionServiceUrl: process.env.EXCEPTION_SERVICE_URL || '',
  evidenceServiceUrl: process.env.EVIDENCE_SERVICE_URL || '',
  telemetryServiceUrl: process.env.TELEMETRY_SERVICE_URL || '',
  oauthClientId: process.env.OAUTH_CLIENT_ID || '',
  templateSigningPublicKey: process.env.TEMPLATE_SIGNING_PUBLIC_KEY || '',
  templateConfidenceThreshold: parseFloat(process.env.TEMPLATE_CONFIDENCE_THRESHOLD_DEFAULT || '0.7')
};
```

### Build Configuration

```javascript
// webpack.config.js - DefinePlugin for environment variables
new webpack.DefinePlugin({
  'process.env.AUTH_SERVICE_URL': JSON.stringify(process.env.AUTH_SERVICE_URL),
  'process.env.QUEUE_SERVICE_URL': JSON.stringify(process.env.QUEUE_SERVICE_URL),
  // ... etc
})
```

