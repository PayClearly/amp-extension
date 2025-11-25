# Remaining Work Plan

## Overview

This document outlines the remaining work required to make the PayClearly Chrome Extension fully functional and production-ready. The extension core is complete, but backend services and integrations need to be implemented.

---

## Phase 1: Backend Services (Critical Path)

### 1.1 Queue Passthrough Service ⚠️ **BLOCKING**

**Status**: Not implemented
**Priority**: **CRITICAL** - Extension cannot fetch payments without this

**Requirements**:
- **Technology**: Cloud Run (Go/Python/Node.js)
- **Database**: MongoDB (query existing queue)
- **Endpoint**: `GET /api/v1/queue/next-payment`
- **Features**:
  - JWT token validation
  - Extract operator_id from token
  - Long-polling (30s timeout, max 60s)
  - Query MongoDB for next priority payment for operator
  - Return 200 with payment or 204 if no payment available
  - Integrate with existing Payment Service for full payment details
  - Include portal info from PSOP if template missing

**Implementation Steps**:
1. Create service structure (choose language: Go/Python/Node.js)
2. Set up MongoDB connection
3. Implement JWT validation middleware
4. Implement long-polling logic
5. Query queue collection for operator's next payment
6. Fetch full payment details from Payment Service
7. Deploy to Cloud Run via Pulumi
8. Test with extension (disable test mode)

**Files to Create**:
- `services/queue-passthrough/` (or use existing backend structure)
- MongoDB query logic
- Long-polling handler
- Integration with Payment Service

**Estimated Time**: 2-3 days

---

### 1.2 Portal Learning Service ⚠️ **BLOCKING**

**Status**: Pulumi infrastructure exists, service not implemented
**Priority**: **CRITICAL** - Learning mode cannot save templates without this

**Requirements**:
- **Technology**: Cloud Run (Go/Python/Node.js)
- **Database**: MongoDB (store portal templates)
- **Endpoints**:
  - `GET /api/v1/portals/templates?portalId=...&accountId=...&clientId=...&vendorId=...&pageKey=...`
  - `POST /api/v1/portals/templates` (create/update template)
  - `PUT /api/v1/portals/templates/{templateId}/usage` (update usage stats)
- **Features**:
  - Store templates in MongoDB
  - Template signing (RSA signature generation)
  - Template retrieval by portal/account/client/vendor/pageKey
  - Confidence calculation
  - Usage tracking

**MongoDB Schema**:
```javascript
{
  _id: ObjectId,
  portalId: String,
  accountId: String,
  clientId: String,
  vendorId: String,
  pageKey: String, // 'payment_form', 'confirmation', etc.
  fields: [{
    selector: String,
    semanticType: String,
    inputType: String,
    label: String,
    confidence: Number
  }],
  confidence: Number, // Overall template confidence
  version: Number,
  signature: String, // RSA signature
  usageCount: Number,
  successCount: Number,
  lastUsedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Implementation Steps**:
1. Create service structure
2. Set up MongoDB connection and collections
3. Implement template CRUD operations
4. Implement RSA signature generation (use private key from Secret Manager)
5. Implement confidence calculation logic
6. Deploy to Cloud Run via Pulumi
7. Test template creation from extension learning mode
8. Test template retrieval for autofill

**Files to Create**:
- `services/portal-learning/` (or use existing backend structure)
- MongoDB models and queries
- Template signing logic
- Confidence calculation

**Estimated Time**: 3-4 days

---

### 1.3 Evidence Service Integration ✅ **PARTIALLY COMPLETE**

**Status**: Extension code complete, backend integration needed
**Priority**: **HIGH** - Evidence uploads won't work without backend

**Requirements**:
- **Endpoint**: `POST /api/v1/evidence/presigned-url`
- **Request Body**:
  ```json
  {
    "paymentId": "pay_123",
    "gcsPath": "orgId/accountId/paymentId/sent/hashedFilename",
    "hashedFilename": "abc123...",
    "bucket": "payclearly-32f4e-storage-backup"
  }
  ```
- **Response**: Pre-signed URL for GCS upload
- **Features**:
  - Generate pre-signed URL for GCS bucket
  - Validate paymentId and permissions
  - Set appropriate expiration (1 hour)

**Implementation Steps**:
1. Check if Evidence Service exists or needs new endpoint
2. Implement pre-signed URL generation for GCS
3. Validate payment ownership
4. Test with extension (disable test mode)

**Estimated Time**: 1 day (if service exists) or 2-3 days (if new)

---

### 1.4 Telemetry Service (Optional)

**Status**: Extension code complete, backend optional
**Priority**: **MEDIUM** - Can use BigQuery direct insert instead

**Options**:
1. **Direct BigQuery Insert** (Recommended):
   - Extension writes directly to BigQuery
   - Requires service account key in extension (secure storage)
   - No HTTP service needed

2. **HTTP Telemetry Service**:
   - Endpoint: `POST /api/v1/telemetry/events`
   - Batch events
   - Write to BigQuery

**Implementation Steps** (if using HTTP service):
1. Create service or add endpoint to existing service
2. Implement event batching
3. Write to BigQuery
4. Deploy

**Estimated Time**: 1-2 days (if HTTP service) or 0 days (if direct BigQuery)

---

## Phase 2: Extension Integration & Testing

### 2.1 Connect Extension to Real Services

**Tasks**:
1. Update `src/shared/config.ts` with real service URLs
2. Disable test mode (`USE_TEST_DATA=false`)
3. Test authentication flow
4. Test payment fetching
5. Test template retrieval
6. Test evidence upload

**Files to Update**:
- `src/shared/config.ts` - Add environment variables
- `webpack.config.js` - Ensure env vars are injected
- `.env` file (if using) - Add service URLs

**Estimated Time**: 1 day

---

### 2.2 Template Signing Verification

**Status**: Extension expects signed templates, signing not implemented
**Priority**: **HIGH**

**Requirements**:
- Portal Learning Service must sign templates with RSA private key
- Extension verifies signature with public key
- Public key stored in extension config or fetched from backend

**Implementation Steps**:
1. Generate RSA key pair (or use existing)
2. Store private key in GCP Secret Manager
3. Implement signing in Portal Learning Service
4. Store public key in extension config or fetch from backend
5. Implement signature verification in extension (`src/shared/schemas.ts`)
6. Test signature verification

**Files to Update**:
- `services/portal-learning/` - Add signing logic
- `src/shared/schemas.ts` - Add signature verification
- `src/shared/config.ts` - Add public key

**Estimated Time**: 1-2 days

---

### 2.3 Payment Completion Endpoint

**Status**: Extension has TODO for marking payment complete
**Priority**: **MEDIUM**

**Requirements**:
- Endpoint: `PUT /api/v1/queue/payments/{paymentId}/complete`
- Request body: Evidence URL, metadata, timestamps
- Mark payment as complete in queue

**Implementation Steps**:
1. Check if endpoint exists in Queue Service
2. If not, add endpoint to Queue Passthrough Service
3. Update payment status in MongoDB
4. Update extension to call endpoint (`src/background/stateMachine.ts`)

**Files to Update**:
- `services/queue-passthrough/` - Add completion endpoint
- `src/background/stateMachine.ts` - Remove TODO, call endpoint

**Estimated Time**: 1 day

---

## Phase 3: Production Readiness

### 3.1 Error Handling & Resilience

**Tasks**:
- Add retry logic for all API calls (already done for queue)
- Add error recovery for template retrieval failures
- Add fallback for evidence upload failures
- Improve error messages for operators

**Estimated Time**: 1-2 days

---

### 3.2 Security Hardening

**Tasks**:
- Review token storage (currently in memory, refresh token encrypted)
- Review permissions in manifest
- Add CSP headers if needed
- Review template signature verification
- Security audit of API client

**Estimated Time**: 2-3 days

---

### 3.3 Performance Optimization

**Tasks**:
- Optimize template caching
- Reduce bundle size
- Optimize content script injection
- Add performance telemetry

**Estimated Time**: 1-2 days

---

### 3.4 Testing & QA

**Tasks**:
- Unit tests for critical paths
- Integration tests with mock services
- E2E tests with real portals
- Load testing for backend services
- Security testing

**Estimated Time**: 3-5 days

---

## Phase 4: Documentation & Deployment

### 4.1 Documentation

**Tasks**:
- API documentation for backend services
- Operator user guide
- Developer setup guide
- Troubleshooting guide

**Estimated Time**: 2-3 days

---

### 4.2 Deployment

**Tasks**:
- Set up CI/CD pipeline
- Deploy to staging environment
- Deploy to production
- Monitor and alerting setup

**Estimated Time**: 2-3 days

---

## Summary

### Critical Path (Must Complete First)
1. **Queue Passthrough Service** (2-3 days) - BLOCKING
2. **Portal Learning Service** (3-4 days) - BLOCKING
3. **Connect Extension to Services** (1 day) - BLOCKING
4. **Template Signing** (1-2 days) - HIGH PRIORITY

**Total Critical Path**: ~7-10 days

### High Priority (Complete Before Production)
5. Evidence Service Integration (1-3 days)
6. Payment Completion Endpoint (1 day)
7. Error Handling & Resilience (1-2 days)

**Total High Priority**: ~3-6 days

### Medium Priority (Can Complete in Parallel)
8. Telemetry Service (0-2 days)
9. Security Hardening (2-3 days)
10. Performance Optimization (1-2 days)
11. Testing & QA (3-5 days)

**Total Medium Priority**: ~6-12 days

### Nice to Have
12. Documentation (2-3 days)
13. Deployment Automation (2-3 days)

**Total Nice to Have**: ~4-6 days

---

## Recommended Implementation Order

### Week 1: Backend Services
- Day 1-3: Queue Passthrough Service
- Day 4-7: Portal Learning Service (start template signing)

### Week 2: Integration & Signing
- Day 1-2: Complete template signing
- Day 3: Connect extension to services
- Day 4-5: Evidence Service integration
- Day 6-7: Payment completion endpoint

### Week 3: Polish & Testing
- Day 1-2: Error handling improvements
- Day 3-5: Testing & QA
- Day 6-7: Security review

### Week 4: Production Readiness
- Day 1-2: Performance optimization
- Day 3-4: Documentation
- Day 5-7: Deployment & monitoring

---

## Dependencies

- **MongoDB**: Must be accessible from Cloud Run services
- **GCP Services**: Cloud Run, Secret Manager, GCS, BigQuery
- **Existing Services**: Payment Service, Auth Service, Exception Service
- **RSA Keys**: For template signing (generate or use existing)

---

## Blocking Questions

1. **MongoDB Connection**: What's the connection string/credentials for MongoDB?
2. **Queue Collection**: What's the MongoDB collection name and schema for the queue?
3. **Payment Service**: What's the endpoint to fetch full payment details?
4. **RSA Keys**: Do we have existing RSA keys for template signing, or should we generate new ones?
5. **Organization ID**: How is organizationId derived? Is it in payment metadata or derived from accountId?

---

## Next Steps

1. **Immediate**: Start Queue Passthrough Service implementation
2. **Parallel**: Set up MongoDB connection and test queries
3. **Next**: Begin Portal Learning Service implementation
4. **After Services**: Connect extension and test end-to-end

