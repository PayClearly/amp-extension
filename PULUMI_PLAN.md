# Pulumi Infrastructure as Code Plan

## 1. Pulumi Project Structure

```
infra/
  Pulumi.yaml                    # Root Pulumi project
  Pulumi.dev.yaml               # Dev stack config
  Pulumi.test.yaml              # Test stack config
  Pulumi.staging.yaml           # Staging stack config
  Pulumi.prod.yaml              # Prod stack config

  queue-service/
    Pulumi.yaml                 # Queue service project
    index.ts                    # Queue service resources
    main.go                     # Queue service code

  portal-learning-service/
    Pulumi.yaml                 # Portal learning service project
    index.ts                    # Portal learning service resources
    main.go                     # Portal learning service code

  telemetry/
    Pulumi.yaml                 # Telemetry project
    index.ts                    # BigQuery resources

  shared/
    service-account.ts          # Shared service account
    iam.ts                      # IAM bindings
    secrets.ts                  # Secret Manager setup
```

## 2. Root Pulumi Configuration

### Pulumi.yaml
```yaml
name: payclearly-extension-infra
runtime: nodejs
description: Infrastructure for PayClearly Chrome Extension backend services
```

### Pulumi.dev.yaml
```yaml
config:
  gcp:project: payclearly-dev
  gcp:region: us-central1

  # Service URLs
  payclearly-extension-infra:authServiceUrl: https://auth.dev.payclearly.com
  payclearly-extension-infra:queueServiceUrl: https://queue.dev.payclearly.com
  payclearly-extension-infra:paymentServiceUrl: https://payments.dev.payclearly.com
  payclearly-extension-infra:psopServiceUrl: https://psop.dev.payclearly.com
  payclearly-extension-infra:exceptionServiceUrl: https://exceptions.dev.payclearly.com
  payclearly-extension-infra:evidenceServiceUrl: https://evidence.dev.payclearly.com

  # GCS
  payclearly-extension-infra:evidenceBucketName: payclearly-evidence-dev

  # BigQuery
  payclearly-extension-infra:bigQueryDataset: payclearly_extension_telemetry
  payclearly-extension-infra:bigQueryTable: events

  # Secrets
  payclearly-extension-infra:templateSigningPrivateKeySecret: template-signing-private-key-dev
```

### Pulumi.prod.yaml
```yaml
config:
  gcp:project: payclearly-prod
  gcp:region: us-central1

  # Service URLs
  payclearly-extension-infra:authServiceUrl: https://auth.payclearly.com
  payclearly-extension-infra:queueServiceUrl: https://queue.payclearly.com
  payclearly-extension-infra:paymentServiceUrl: https://payments.payclearly.com
  payclearly-extension-infra:psopServiceUrl: https://psop.payclearly.com
  payclearly-extension-infra:exceptionServiceUrl: https://exceptions.payclearly.com
  payclearly-extension-infra:evidenceServiceUrl: https://evidence.payclearly.com

  # GCS
  payclearly-extension-infra:evidenceBucketName: payclearly-evidence-prod

  # BigQuery
  payclearly-extension-infra:bigQueryDataset: payclearly_extension_telemetry
  payclearly-extension-infra:bigQueryTable: events

  # Secrets
  payclearly-extension-infra:templateSigningPrivateKeySecret: template-signing-private-key-prod
```

## 3. Queue Service Infrastructure

### infra/queue-service/index.ts
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as docker from "@pulumi/docker";

const config = new pulumi.Config();

// Get service account
const queueServiceAccount = new gcp.serviceaccount.Account("queue-service-account", {
  accountId: "queue-service",
  displayName: "Queue Passthrough Service Account",
});

// Grant Cloud Run invoker role
const queueServiceInvoker = new gcp.projects.IAMMember("queue-service-invoker", {
  project: config.require("gcp:project"),
  role: "roles/run.invoker",
  member: pulumi.interpolate`serviceAccount:${queueServiceAccount.email}`,
});

// Create Cloud Run service
const queueService = new gcp.cloudrun.Service("queue-service", {
  location: config.require("gcp:region"),
  template: {
    spec: {
      serviceAccountName: queueServiceAccount.email,
      containers: [{
        image: pulumi.interpolate`gcr.io/${config.require("gcp:project")}/queue-service:latest`,
        ports: [{
          containerPort: 8080,
        }],
        envs: [
          {
            name: "PORT",
            value: "8080",
          },
          {
            name: "QUEUE_SERVICE_URL",
            value: config.require("queueServiceUrl"),
          },
          {
            name: "PAYMENT_SERVICE_URL",
            value: config.require("paymentServiceUrl"),
          },
          {
            name: "PSOP_SERVICE_URL",
            value: config.require("psopServiceUrl"),
          },
          {
            name: "AUTH_SERVICE_URL",
            value: config.require("authServiceUrl"),
          },
        ],
        resources: {
          limits: {
            cpu: "1000m",
            memory: "512Mi",
          },
        },
      }],
      containerConcurrency: 10,
      timeoutSeconds: 60,
    },
    metadata: {
      annotations: {
        "autoscaling.knative.dev/minScale": "0",
        "autoscaling.knative.dev/maxScale": "1",
        "run.googleapis.com/execution-environment": "gen2",
      },
    },
  },
});

// Allow unauthenticated access (or use IAM for authenticated)
const queueServiceIam = new gcp.cloudrun.IamMember("queue-service-iam", {
  service: queueService.name,
  location: queueService.location,
  role: "roles/run.invoker",
  member: "allUsers", // Or restrict to specific service accounts
});

// Export service URL
export const queueServiceUrl = queueService.statuses[0].url;
```

### infra/queue-service/Pulumi.yaml
```yaml
name: queue-service
runtime: nodejs
description: Queue Passthrough Service infrastructure
```

## 4. Portal Learning Service Infrastructure

### infra/portal-learning-service/index.ts
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();

// Create Firestore database (if not exists)
const firestoreDatabase = new gcp.firestore.Database("portal-learning-db", {
  project: config.require("gcp:project"),
  locationId: config.require("gcp:region"),
  type: "FIRESTORE_NATIVE",
  name: "portal-learning",
}, {
  protect: true, // Prevent accidental deletion
});

// Create service account
const portalLearningServiceAccount = new gcp.serviceaccount.Account("portal-learning-service-account", {
  accountId: "portal-learning-service",
  displayName: "Portal Learning Service Account",
});

// Grant Firestore access
const portalLearningFirestoreAccess = new gcp.projects.IAMMember("portal-learning-firestore-access", {
  project: config.require("gcp:project"),
  role: "roles/datastore.user",
  member: pulumi.interpolate`serviceAccount:${portalLearningServiceAccount.email}`,
});

// Grant Secret Manager access
const portalLearningSecretAccess = new gcp.projects.IAMMember("portal-learning-secret-access", {
  project: config.require("gcp:project"),
  role: "roles/secretmanager.secretAccessor",
  member: pulumi.interpolate`serviceAccount:${portalLearningServiceAccount.email}`,
});

// Create Cloud Run service
const portalLearningService = new gcp.cloudrun.Service("portal-learning-service", {
  location: config.require("gcp:region"),
  template: {
    spec: {
      serviceAccountName: portalLearningServiceAccount.email,
      containers: [{
        image: pulumi.interpolate`gcr.io/${config.require("gcp:project")}/portal-learning-service:latest`,
        ports: [{
          containerPort: 8080,
        }],
        envs: [
          {
            name: "PORT",
            value: "8080",
          },
          {
            name: "GCP_PROJECT_ID",
            value: config.require("gcp:project"),
          },
          {
            name: "FIRESTORE_DATABASE_ID",
            value: firestoreDatabase.name,
          },
          {
            name: "TEMPLATE_SIGNING_PRIVATE_KEY_SECRET",
            value: config.require("templateSigningPrivateKeySecret"),
          },
        ],
        resources: {
          limits: {
            cpu: "1000m",
            memory: "512Mi",
          },
        },
      }],
      containerConcurrency: 10,
      timeoutSeconds: 30,
    },
    metadata: {
      annotations: {
        "autoscaling.knative.dev/minScale": "0",
        "autoscaling.knative.dev/maxScale": "1",
        "run.googleapis.com/execution-environment": "gen2",
      },
    },
  },
});

// Allow authenticated access
const portalLearningServiceIam = new gcp.cloudrun.IamMember("portal-learning-service-iam", {
  service: portalLearningService.name,
  location: portalLearningService.location,
  role: "roles/run.invoker",
  member: "allUsers", // Or restrict to specific service accounts
});

// Export service URL
export const portalLearningServiceUrl = portalLearningService.statuses[0].url;
```

### Alternative: Cloud SQL (PostgreSQL)

```typescript
// If using Cloud SQL instead of Firestore
const portalLearningDatabase = new gcp.sql.DatabaseInstance("portal-learning-db", {
  project: config.require("gcp:project"),
  region: config.require("gcp:region"),
  databaseVersion: "POSTGRES_14",
  settings: {
    tier: "db-f1-micro", // Or db-n1-standard-1 for production
    backupConfiguration: {
      enabled: true,
      startTime: "03:00",
    },
    ipConfiguration: {
      ipv4Enabled: false,
      privateNetwork: "projects/payclearly-prod/global/networks/default",
    },
  },
  deletionProtection: true,
});

const portalLearningDatabaseDb = new gcp.sql.Database("portal-learning-db", {
  instance: portalLearningDatabase.name,
  name: "portal_learning",
});

const portalLearningDatabaseUser = new gcp.sql.User("portal-learning-db-user", {
  instance: portalLearningDatabase.name,
  name: "portal_learning_user",
  password: config.requireSecret("portalLearningDbPassword"),
});
```

## 5. Telemetry Infrastructure (BigQuery)

### infra/telemetry/index.ts
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();

// Create BigQuery dataset
const telemetryDataset = new gcp.bigquery.Dataset("extension-telemetry-dataset", {
  project: config.require("gcp:project"),
  datasetId: config.require("bigQueryDataset"),
  location: config.require("gcp:region"),
  description: "Telemetry data for PayClearly Chrome Extension",
  defaultTableExpirationMs: 365 * 24 * 60 * 60 * 1000, // 1 year
  labels: {
    environment: pulumi.getStack(),
  },
});

// Create events table
const eventsTable = new gcp.bigquery.Table("extension-telemetry-events", {
  project: config.require("gcp:project"),
  datasetId: telemetryDataset.datasetId,
  tableId: config.require("bigQueryTable"),
  description: "Extension telemetry events",
  schema: JSON.stringify([
    {
      name: "event_id",
      type: "STRING",
      mode: "REQUIRED",
    },
    {
      name: "event_type",
      type: "STRING",
      mode: "REQUIRED",
    },
    {
      name: "timestamp",
      type: "TIMESTAMP",
      mode: "REQUIRED",
    },
    {
      name: "operator_id",
      type: "STRING",
      mode: "NULLABLE",
    },
    {
      name: "payment_id",
      type: "STRING",
      mode: "NULLABLE",
    },
    {
      name: "portal_id",
      type: "STRING",
      mode: "NULLABLE",
    },
    {
      name: "page_key",
      type: "STRING",
      mode: "NULLABLE",
    },
    {
      name: "metadata",
      type: "JSON",
      mode: "NULLABLE",
    },
    {
      name: "created_at",
      type: "TIMESTAMP",
      mode: "REQUIRED",
    },
  ]),
  timePartitioning: {
    type: "DAY",
    field: "timestamp",
  },
  clustering: ["event_type", "operator_id"],
  labels: {
    environment: pulumi.getStack(),
  },
});

// Create service account for extension to write to BigQuery
const telemetryWriterServiceAccount = new gcp.serviceaccount.Account("telemetry-writer-sa", {
  accountId: "telemetry-writer",
  displayName: "Telemetry Writer Service Account",
});

// Grant BigQuery Data Editor role
const telemetryWriterBigQueryAccess = new gcp.projects.IAMMember("telemetry-writer-bigquery-access", {
  project: config.require("gcp:project"),
  role: "roles/bigquery.dataEditor",
  member: pulumi.interpolate`serviceAccount:${telemetryWriterServiceAccount.email}`,
});

// Export service account email for extension config
export const telemetryWriterServiceAccountEmail = telemetryWriterServiceAccount.email;

// Optional: Create service account key (for extension to authenticate)
// Note: Prefer Application Default Credentials or Workload Identity in production
const telemetryWriterKey = new gcp.serviceaccount.Key("telemetry-writer-key", {
  serviceAccountId: telemetryWriterServiceAccount.name,
  publicKeyType: "TYPE_X509_PEM_FILE",
});

export const telemetryWriterKeyData = telemetryWriterKey.privateKey;
```

### Alternative: HTTP Telemetry Service

```typescript
// If using HTTP service instead of direct BigQuery
const telemetryService = new gcp.cloudrun.Service("telemetry-service", {
  location: config.require("gcp:region"),
  template: {
    spec: {
      serviceAccountName: telemetryWriterServiceAccount.email,
      containers: [{
        image: pulumi.interpolate`gcr.io/${config.require("gcp:project")}/telemetry-service:latest`,
        ports: [{
          containerPort: 8080,
        }],
        envs: [
          {
            name: "PORT",
            value: "8080",
          },
          {
            name: "GCP_PROJECT_ID",
            value: config.require("gcp:project"),
          },
          {
            name: "BIGQUERY_DATASET",
            value: telemetryDataset.datasetId,
          },
          {
            name: "BIGQUERY_TABLE",
            value: eventsTable.tableId,
          },
        ],
      }],
    },
  },
});

export const telemetryServiceUrl = telemetryService.statuses[0].url;
```

## 6. GCS Evidence Bucket (if not exists)

### infra/shared/gcs.ts
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();

// Get existing bucket or create new one
const evidenceBucket = new gcp.storage.Bucket("evidence-bucket", {
  project: config.require("gcp:project"),
  name: config.require("evidenceBucketName"),
  location: config.require("gcp:region"),
  uniformBucketLevelAccess: true,
  lifecycleRules: [{
    condition: {
      age: 365, // Delete after 1 year
    },
    action: {
      type: "Delete",
    },
  }],
  labels: {
    environment: pulumi.getStack(),
  },
});

// Create service account for Evidence Service to generate pre-signed URLs
const evidenceServiceAccount = new gcp.serviceaccount.Account("evidence-service-account", {
  accountId: "evidence-service",
  displayName: "Evidence Service Account",
});

// Grant Storage Object Admin role (for pre-signed URL generation)
const evidenceStorageAccess = new gcp.projects.IAMMember("evidence-storage-access", {
  project: config.require("gcp:project"),
  role: "roles/storage.objectAdmin",
  member: pulumi.interpolate`serviceAccount:${evidenceServiceAccount.email}`,
});

export const evidenceBucketName = evidenceBucket.name;
```

## 7. Secret Manager Setup

### infra/shared/secrets.ts
```typescript
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();

// Template signing private key secret (create manually or via Pulumi)
// Note: Private key should be generated separately and stored securely
const templateSigningPrivateKeySecret = new gcp.secretmanager.Secret("template-signing-private-key", {
  project: config.require("gcp:project"),
  secretId: config.require("templateSigningPrivateKeySecret"),
  replication: {
    automatic: true,
  },
  labels: {
    environment: pulumi.getStack(),
  },
});

// Secret version (create manually with actual key)
// const templateSigningPrivateKeyVersion = new gcp.secretmanager.SecretVersion("template-signing-private-key-version", {
//   secret: templateSigningPrivateKeySecret.id,
//   secretData: config.requireSecret("templateSigningPrivateKeyData"),
// });

export const templateSigningPrivateKeySecretName = templateSigningPrivateKeySecret.secretId;
```

## 8. IAM and Service Account Summary

### Service Accounts Created
1. **queue-service-account**: Queue Passthrough Service
   - Roles: `roles/run.invoker`

2. **portal-learning-service-account**: Portal Learning Service
   - Roles: `roles/datastore.user`, `roles/secretmanager.secretAccessor`

3. **telemetry-writer-sa**: Extension telemetry writer
   - Roles: `roles/bigquery.dataEditor`

4. **evidence-service-account**: Evidence Service (if creating bucket)
   - Roles: `roles/storage.objectAdmin`

## 9. Deployment Commands

### Initialize Pulumi
```bash
cd infra
pulumi stack init dev
pulumi config set gcp:project payclearly-dev
pulumi config set gcp:region us-central1
```

### Deploy Queue Service
```bash
cd infra/queue-service
pulumi up
```

### Deploy Portal Learning Service
```bash
cd infra/portal-learning-service
pulumi up
```

### Deploy Telemetry
```bash
cd infra/telemetry
pulumi up
```

### Deploy All
```bash
cd infra
pulumi up --all
```

## 10. Environment Variable Reference

### Extension Build-Time Variables
```bash
AUTH_SERVICE_URL=https://auth.dev.payclearly.com
QUEUE_SERVICE_URL=https://queue-service-xxx.run.app
PAYMENT_SERVICE_URL=https://payments.dev.payclearly.com
PORTAL_LEARNING_SERVICE_URL=https://portal-learning-service-xxx.run.app
EXCEPTION_SERVICE_URL=https://exceptions.dev.payclearly.com
EVIDENCE_SERVICE_URL=https://evidence.dev.payclearly.com
TELEMETRY_SERVICE_URL=https://telemetry-service-xxx.run.app  # Or use BigQuery directly
GCP_PROJECT_ID=payclearly-dev
BIGQUERY_DATASET=payclearly_extension_telemetry
BIGQUERY_TABLE=events
GCS_EVIDENCE_BUCKET=payclearly-evidence-dev
OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
OAUTH_SCOPES=https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile
OAUTH_AUDIENCE=https://auth.dev.payclearly.com
TEMPLATE_SIGNING_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
TEMPLATE_CONFIDENCE_THRESHOLD_DEFAULT=0.7
```

### Backend Service Environment Variables

**Queue Service**:
- `PORT=8080`
- `QUEUE_SERVICE_URL` (existing queue service)
- `PAYMENT_SERVICE_URL`
- `PSOP_SERVICE_URL`
- `AUTH_SERVICE_URL`

**Portal Learning Service**:
- `PORT=8080`
- `GCP_PROJECT_ID`
- `FIRESTORE_DATABASE_ID` (or `CLOUD_SQL_CONNECTION_NAME`)
- `TEMPLATE_SIGNING_PRIVATE_KEY_SECRET` (Secret Manager secret name)

**Telemetry Service** (if HTTP):
- `PORT=8080`
- `GCP_PROJECT_ID`
- `BIGQUERY_DATASET`
- `BIGQUERY_TABLE`

## 11. CI/CD Integration

### GitHub Actions Example
```yaml
# .github/workflows/deploy-infra.yml
name: Deploy Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'infra/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: google-github-actions/setup-gcloud@v1
      - uses: pulumi/actions@v3
        with:
          stack-name: dev
          work-dir: infra
```

