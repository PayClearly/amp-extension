// Test mode flag - set USE_TEST_DATA=true to enable mock data
const USE_TEST_DATA = process.env.USE_TEST_DATA === 'true' || process.env.NODE_ENV === 'development';

export const config = {
  useTestData: USE_TEST_DATA,
  authServiceUrl: process.env.AUTH_SERVICE_URL || '',
  queueServiceUrl: process.env.QUEUE_SERVICE_URL || '',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || '',
  portalLearningServiceUrl: process.env.PORTAL_LEARNING_SERVICE_URL || '',
  exceptionServiceUrl: process.env.EXCEPTION_SERVICE_URL || '',
  evidenceServiceUrl: process.env.EVIDENCE_SERVICE_URL || '',
  telemetryServiceUrl: process.env.TELEMETRY_SERVICE_URL || '',
  gcpProjectId: process.env.GCP_PROJECT_ID || '',
  bigQueryDataset: process.env.BIGQUERY_DATASET || '',
  bigQueryTable: process.env.BIGQUERY_TABLE || '',
  gcsEvidenceBucket: process.env.GCS_EVIDENCE_BUCKET || '',
  oauthClientId: process.env.OAUTH_CLIENT_ID || '',
  templateSigningPublicKey: process.env.TEMPLATE_SIGNING_PUBLIC_KEY || '',
  templateConfidenceThreshold: parseFloat(
    process.env.TEMPLATE_CONFIDENCE_THRESHOLD_DEFAULT || '0.7'
  ),
  // Obfuscation
  obfuscationEnabled: true, // Can be toggled via operator preference
};

