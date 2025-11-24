# Backend Build Plan

## 1. Queue Passthrough Service

### Purpose
Specialized queue handling endpoint that returns the next priority payment for the current operator, integrating with existing queue infrastructure.

### Technology
- **Runtime**: Cloud Run (Go or Python)
- **Scaling**: 0-1 instances (cost-optimized), auto-scale to 1 on request
- **Timeout**: 30s for long-polling

### Endpoints

#### GET /api/v1/queue/next-payment
**Description**: Long-polling endpoint that returns the next priority payment for the authenticated operator.

**Headers**:
- `Authorization: Bearer <access_token>`
- `X-Operator-Id: <operator_id>` (optional, extracted from token if available)

**Query Parameters**:
- `timeout` (optional): Long-poll timeout in seconds (default: 30, max: 60)

**Response** (200 OK):
```json
{
  "payment": {
    "id": "pay_123",
    "accountId": "acc_456",
    "clientId": "client_789",
    "vendorId": "vendor_abc",
    "vendorName": "Acme Corp",
    "amount": 1234.56,
    "currency": "USD",
    "invoiceNumbers": ["INV-001", "INV-002"],
    "portalId": "portal_xyz",
    "portalUrl": "https://vendor-portal.example.com/pay",
    "virtualCard": {
      "cardNumber": "4111111111111111",
      "expiry": "12/25",
      "cvv": "123",
      "accountNumber": "123456789",
      "routingNumber": "987654321"
    },
    "metadata": {
      "priority": "high",
      "dueDate": "2024-01-15"
    }
  },
  "queuePosition": 3,
  "estimatedWaitTime": 120
}
```

**Response** (204 No Content):
- No payment available (long-poll timeout)

**Response** (401 Unauthorized):
- Invalid or expired token

**Response** (500 Internal Server Error):
- Queue service unavailable

**Logic**:
1. Validate JWT token, extract operator_id
2. Query queue service (existing backend) for next payment for operator
3. If payment found, return immediately
4. If no payment, long-poll (wait up to timeout seconds) for new payment
5. Return payment with full details from Payment Service
6. Include portal info from PSOP if template missing

### Implementation Files

**Go Example** (`infra/queue-service/main.go`):
```go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "strconv"
    "time"

    "github.com/gorilla/mux"
    "google.golang.org/api/idtoken"
)

type PaymentResponse struct {
    Payment         Payment `json:"payment"`
    QueuePosition   int     `json:"queuePosition"`
    EstimatedWaitTime int   `json:"estimatedWaitTime"`
}

func getNextPayment(w http.ResponseWriter, r *http.Request) {
    // Validate token
    token := r.Header.Get("Authorization")
    if token == "" {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Extract operator ID from token
    operatorID := extractOperatorID(token)

    // Get timeout (default 30s)
    timeout := 30
    if t := r.URL.Query().Get("timeout"); t != "" {
        if parsed, err := strconv.Atoi(t); err == nil && parsed <= 60 {
            timeout = parsed
        }
    }

    // Long-poll queue service
    ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeout)*time.Second)
    defer cancel()

    payment, err := pollQueueService(ctx, operatorID)
    if err != nil {
        if err == context.DeadlineExceeded {
            w.WriteHeader(http.StatusNoContent)
            return
        }
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    // Fetch full payment details
    fullPayment, err := fetchPaymentDetails(payment.ID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    // Enrich with portal info if missing
    if fullPayment.PortalID == "" {
        portalInfo := fetchPSOPPortalInfo(fullPayment.VendorID)
        fullPayment.PortalID = portalInfo.ID
        fullPayment.PortalURL = portalInfo.URL
    }

    response := PaymentResponse{
        Payment: fullPayment,
        QueuePosition: getQueuePosition(operatorID),
        EstimatedWaitTime: estimateWaitTime(operatorID),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

func main() {
    r := mux.NewRouter()
    r.HandleFunc("/api/v1/queue/next-payment", getNextPayment).Methods("GET")

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    log.Printf("Queue service listening on port %s", port)
    log.Fatal(http.ListenAndServe(":"+port, r))
}
```

**Python Example** (`infra/queue-service/main.py`):
```python
from flask import Flask, request, jsonify
from google.auth import jwt
import requests
import os
import time

app = Flask(__name__)

QUEUE_SERVICE_URL = os.getenv('QUEUE_SERVICE_URL')
PAYMENT_SERVICE_URL = os.getenv('PAYMENT_SERVICE_URL')
PSOP_SERVICE_URL = os.getenv('PSOP_SERVICE_URL')

@app.route('/api/v1/queue/next-payment', methods=['GET'])
def get_next_payment():
    # Validate token
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({'error': 'Unauthorized'}), 401

    token = auth_header.replace('Bearer ', '')
    operator_id = extract_operator_id(token)

    # Get timeout
    timeout = int(request.args.get('timeout', 30))
    timeout = min(timeout, 60)

    # Long-poll queue service
    payment = poll_queue_service(operator_id, timeout)
    if not payment:
        return '', 204

    # Fetch full payment details
    full_payment = fetch_payment_details(payment['id'])

    # Enrich with portal info if missing
    if not full_payment.get('portalId'):
        portal_info = fetch_psop_portal_info(full_payment['vendorId'])
        full_payment['portalId'] = portal_info['id']
        full_payment['portalUrl'] = portal_info['url']

    return jsonify({
        'payment': full_payment,
        'queuePosition': get_queue_position(operator_id),
        'estimatedWaitTime': estimate_wait_time(operator_id)
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
```

### Pulumi Configuration
See `infra/queue-service/Pulumi.yaml` in Pulumi section.

---

## 2. Portal Learning Service

### Purpose
Stores and retrieves learned form schemas and field mappings keyed by account/client/vendor/portal combination.

### Technology
- **Runtime**: Cloud Run (Go or Python)
- **Database**: Firestore (document store) or Cloud SQL (PostgreSQL)
- **Scaling**: 0-1 instances, auto-scale on request

### Database Schema

**Firestore Collection**: `portal_templates`

**Document Structure**:
```json
{
  "id": "template_123",
  "portalId": "portal_xyz",
  "accountId": "acc_456",
  "clientId": "client_789",
  "vendorId": "vendor_abc",
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
  "version": 1,
  "signature": "RSA_SIGNATURE_HERE",
  "url": "https://vendor-portal.example.com/pay",
  "fingerprint": "abc123...",
  "createdAt": "2024-01-10T12:00:00Z",
  "updatedAt": "2024-01-10T12:00:00Z",
  "createdBy": "operator_123",
  "usageCount": 5,
  "successRate": 0.95
}
```

**Indexes**:
- Composite index on `(portalId, accountId, clientId, vendorId, pageKey)`
- Index on `portalId` for portal-wide queries
- Index on `updatedAt` for cleanup queries

**Cloud SQL Alternative**:
```sql
CREATE TABLE portal_templates (
  id VARCHAR(255) PRIMARY KEY,
  portal_id VARCHAR(255) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  vendor_id VARCHAR(255) NOT NULL,
  page_key VARCHAR(255) NOT NULL,
  fields JSONB NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  url TEXT,
  fingerprint VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2),
  UNIQUE(portal_id, account_id, client_id, vendor_id, page_key)
);

CREATE INDEX idx_portal_templates_lookup ON portal_templates(portal_id, account_id, client_id, vendor_id, page_key);
CREATE INDEX idx_portal_templates_portal ON portal_templates(portal_id);
CREATE INDEX idx_portal_templates_updated ON portal_templates(updated_at);
```

### Endpoints

#### GET /api/v1/portals/templates
**Description**: Retrieve template for a specific portal/account/client/vendor/page combination.

**Query Parameters**:
- `portalId` (required)
- `accountId` (required)
- `clientId` (required)
- `vendorId` (required)
- `pageKey` (optional, defaults to "default")

**Response** (200 OK):
```json
{
  "template": {
    "id": "template_123",
    "portalId": "portal_xyz",
    "accountId": "acc_456",
    "clientId": "client_789",
    "vendorId": "vendor_abc",
    "pageKey": "payment_form",
    "fields": [...],
    "confidence": 0.87,
    "version": 1,
    "signature": "RSA_SIGNATURE_HERE",
    "createdAt": "2024-01-10T12:00:00Z",
    "updatedAt": "2024-01-10T12:00:00Z"
  }
}
```

**Response** (404 Not Found):
- Template not found

#### POST /api/v1/portals/templates
**Description**: Create or update a portal template from learning mode.

**Request Body**:
```json
{
  "portalId": "portal_xyz",
  "accountId": "acc_456",
  "clientId": "client_789",
  "vendorId": "vendor_abc",
  "pageKey": "payment_form",
  "fields": [
    {
      "selector": "#amount-input",
      "semanticType": "amount",
      "inputType": "number",
      "label": "Payment Amount",
      "confidence": 0.9
    }
  ],
  "confidence": 0.87,
  "url": "https://vendor-portal.example.com/pay",
  "fingerprint": "abc123..."
}
```

**Response** (201 Created):
```json
{
  "template": {
    "id": "template_123",
    "version": 1,
    "signature": "RSA_SIGNATURE_HERE",
    "createdAt": "2024-01-10T12:00:00Z"
  }
}
```

**Logic**:
1. Validate request body (Zod schema on backend)
2. Check if template exists for same portal/account/client/vendor/page
3. If exists: Increment version, update fields, recalculate confidence
4. If new: Create new template with version 1
5. Sign template with RSA private key (stored in Secret Manager)
6. Store in database
7. Return template with signature

#### PUT /api/v1/portals/templates/{templateId}/usage
**Description**: Update usage statistics after autofill attempt.

**Request Body**:
```json
{
  "success": true,
  "fieldsFilled": 5,
  "totalFields": 6
}
```

**Response** (200 OK):
- Success

**Logic**:
1. Increment `usageCount`
2. Update `successRate` (rolling average)
3. If success rate drops below threshold, mark template for review

### Template Signing

**Private Key**: Stored in Google Secret Manager
**Public Key**: Provided to extension via environment variable

**Signing Algorithm**: RSA-PSS or RSA-PKCS1-v1_5
**Signature Format**: Base64-encoded

**Verification** (client-side in extension):
```typescript
import { createVerify } from 'crypto';

function verifyTemplateSignature(template: PortalTemplate, publicKey: string): boolean {
  const verify = createVerify('RSA-SHA256');
  verify.update(JSON.stringify({
    portalId: template.portalId,
    accountId: template.accountId,
    clientId: template.clientId,
    vendorId: template.vendorId,
    pageKey: template.pageKey,
    fields: template.fields,
    confidence: template.confidence,
    version: template.version
  }));
  verify.end();
  return verify.verify(publicKey, template.signature, 'base64');
}
```

### Implementation Files

**Go Example** (`infra/portal-learning-service/main.go`):
```go
package main

import (
    "context"
    "crypto"
    "crypto/rand"
    "crypto/rsa"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"

    "cloud.google.com/go/firestore"
    "github.com/gorilla/mux"
    "google.golang.org/api/option"
)

var (
    db          *firestore.Client
    privateKey  *rsa.PrivateKey
)

func signTemplate(template Template) (string, error) {
    // Create hash of template data
    data, _ := json.Marshal(map[string]interface{}{
        "portalId": template.PortalID,
        "accountId": template.AccountID,
        "clientId": template.ClientID,
        "vendorId": template.VendorID,
        "pageKey": template.PageKey,
        "fields": template.Fields,
        "confidence": template.Confidence,
        "version": template.Version,
    })

    hash := sha256.Sum256(data)

    // Sign with RSA private key
    signature, err := rsa.SignPSS(rand.Reader, privateKey, crypto.SHA256, hash[:], nil)
    if err != nil {
        return "", err
    }

    return base64.StdEncoding.EncodeToString(signature), nil
}

func createTemplate(w http.ResponseWriter, r *http.Request) {
    var req CreateTemplateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Check if template exists
    existing, err := findTemplate(req.PortalID, req.AccountID, req.ClientID, req.VendorID, req.PageKey)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    version := 1
    if existing != nil {
        version = existing.Version + 1
    }

    template := Template{
        PortalID:    req.PortalID,
        AccountID:   req.AccountID,
        ClientID:    req.ClientID,
        VendorID:    req.VendorID,
        PageKey:     req.PageKey,
        Fields:      req.Fields,
        Confidence:  req.Confidence,
        Version:     version,
        URL:         req.URL,
        Fingerprint: req.Fingerprint,
    }

    // Sign template
    signature, err := signTemplate(template)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    template.Signature = signature

    // Save to Firestore
    docRef := db.Collection("portal_templates").NewDoc()
    template.ID = docRef.ID
    template.CreatedAt = time.Now()
    template.UpdatedAt = time.Now()

    if _, err := docRef.Set(r.Context(), template); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "template": template,
    })
}

func main() {
    // Initialize Firestore
    ctx := context.Background()
    projectID := os.Getenv("GCP_PROJECT_ID")
    var err error
    db, err = firestore.NewClient(ctx, projectID)
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    // Load private key from Secret Manager
    privateKey = loadPrivateKey()

    r := mux.NewRouter()
    r.HandleFunc("/api/v1/portals/templates", getTemplate).Methods("GET")
    r.HandleFunc("/api/v1/portals/templates", createTemplate).Methods("POST")
    r.HandleFunc("/api/v1/portals/templates/{id}/usage", updateUsage).Methods("PUT")

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    log.Printf("Portal Learning Service listening on port %s", port)
    log.Fatal(http.ListenAndServe(":"+port, r))
}
```

---

## 3. Telemetry Storage

### Option A: BigQuery (Recommended)

**Dataset**: `payclearly_extension_telemetry`
**Table**: `events`

**Schema**:
```sql
CREATE TABLE `payclearly_extension_telemetry.events` (
  event_id STRING NOT NULL,
  event_type STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  operator_id STRING,
  payment_id STRING,
  portal_id STRING,
  page_key STRING,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY event_type, operator_id;
```

**Event Types**:
- `payment_fetched`
- `portal_detected`
- `autofill_attempted`
- `autofill_succeeded`
- `autofill_failed`
- `confirmation_detected`
- `evidence_uploaded`
- `evidence_upload_failed`
- `exception_created`
- `error`

**Metadata Examples**:
```json
// payment_fetched
{
  "queuePosition": 3,
  "estimatedWaitTime": 120
}

// autofill_attempted
{
  "fieldsFilled": 5,
  "totalFields": 6,
  "confidence": 0.87,
  "templateVersion": 1
}

// confirmation_detected
{
  "confirmationNumber": "CONF-123",
  "amount": 1234.56,
  "timing": {
    "paymentReceivedAt": "2024-01-10T12:00:00Z",
    "firstPortalInteractionAt": "2024-01-10T12:01:00Z",
    "confirmationDetectedAt": "2024-01-10T12:03:00Z",
    "paymentCompletedAt": "2024-01-10T12:03:30Z"
  }
}
```

**Ingestion**:
- Direct BigQuery streaming insert from extension (via service account)
- Or: HTTP service that batches and streams to BigQuery

### Option B: HTTP Telemetry Service (Alternative)

**Endpoint**: `POST /api/v1/telemetry/events`

**Request Body**:
```json
{
  "events": [
    {
      "eventType": "payment_fetched",
      "timestamp": "2024-01-10T12:00:00Z",
      "operatorId": "op_123",
      "paymentId": "pay_456",
      "metadata": {...}
    }
  ]
}
```

**Response** (200 OK):
- Success

**Logic**:
1. Validate events
2. Batch insert to BigQuery (or buffer and flush)
3. Return success

### Implementation

**BigQuery Client** (extension-side):
```typescript
// src/background/telemetry.ts
import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: config.gcpProjectId,
  keyFilename: config.serviceAccountKeyPath // Or use Application Default Credentials
});

async function logEvent(event: TelemetryEvent) {
  const rows = [{
    event_id: generateUUID(),
    event_type: event.eventType,
    timestamp: event.timestamp,
    operator_id: event.operatorId,
    payment_id: event.paymentId,
    portal_id: event.portalId,
    page_key: event.pageKey,
    metadata: JSON.stringify(event.metadata)
  }];

  await bigquery
    .dataset('payclearly_extension_telemetry')
    .table('events')
    .insert(rows);
}
```

**HTTP Service** (if using Option B):
```go
// infra/telemetry-service/main.go
func ingestEvents(w http.ResponseWriter, r *http.Request) {
    var req IngestEventsRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Batch insert to BigQuery
    rows := make([]map[string]interface{}, len(req.Events))
    for i, event := range req.Events {
        rows[i] = map[string]interface{}{
            "event_id":   generateUUID(),
            "event_type": event.EventType,
            "timestamp":  event.Timestamp,
            "operator_id": event.OperatorID,
            "payment_id": event.PaymentID,
            "portal_id":  event.PortalID,
            "page_key":   event.PageKey,
            "metadata":   event.Metadata,
        }
    }

    if err := bigqueryClient.Insert(ctx, "payclearly_extension_telemetry.events", rows); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
}
```

---

## 4. Service Dependencies

### Queue Passthrough Service
- **Depends on**: Existing Queue Service, Payment Service, PSOP Service
- **Environment Variables**:
  - `QUEUE_SERVICE_URL`
  - `PAYMENT_SERVICE_URL`
  - `PSOP_SERVICE_URL`
  - `AUTH_SERVICE_URL` (for token validation)

### Portal Learning Service
- **Depends on**: Firestore or Cloud SQL
- **Environment Variables**:
  - `GCP_PROJECT_ID`
  - `FIRESTORE_DATABASE_ID` (or `CLOUD_SQL_CONNECTION_NAME`)
  - `TEMPLATE_SIGNING_PRIVATE_KEY_SECRET` (Secret Manager secret name)

### Telemetry Service (if HTTP)
- **Depends on**: BigQuery
- **Environment Variables**:
  - `GCP_PROJECT_ID`
  - `BIGQUERY_DATASET`
  - `BIGQUERY_TABLE`

---

## 5. API Authentication

All services use JWT tokens from Auth Service.

**Token Validation**:
1. Verify JWT signature with Auth Service public key
2. Check expiration
3. Extract `operator_id` from claims
4. Validate scopes (if applicable)

**Go Example**:
```go
import "github.com/golang-jwt/jwt/v5"

func validateToken(tokenString string) (*jwt.Token, error) {
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
        // Verify signing method
        if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
        }
        // Return public key from Auth Service
        return authServicePublicKey, nil
    })
    return token, err
}
```

---

## 6. Error Handling

**Standard Error Response**:
```json
{
  "error": {
    "code": "PAYMENT_NOT_FOUND",
    "message": "Payment not found",
    "details": {...}
  }
}
```

**HTTP Status Codes**:
- `200 OK`: Success
- `201 Created`: Resource created
- `204 No Content`: No payment available (long-poll timeout)
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Invalid or expired token
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Backend service unavailable

---

## 7. Rate Limiting

**Queue Service**: 10 requests per minute per operator
**Portal Learning Service**: 100 requests per minute per operator
**Telemetry Service**: 1000 requests per minute per operator

**Implementation**: Use Cloud Endpoints or Cloud Armor for rate limiting.

---

## 8. Monitoring

**Metrics**:
- Request latency (p50, p95, p99)
- Error rates (4xx, 5xx)
- Queue depth
- Template cache hit rate
- Telemetry ingestion rate

**Logs**:
- Structured JSON logs
- Request/response logging (sanitized, no sensitive data)
- Error stack traces

**Alerts**:
- Error rate > 1%
- Latency p95 > 1s
- Service unavailable

