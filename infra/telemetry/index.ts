import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

const config = new pulumi.Config();

// Create BigQuery dataset
const telemetryDataset = new gcp.bigquery.Dataset('extension-telemetry-dataset', {
  project: config.require('gcp:project'),
  datasetId: config.require('bigQueryDataset'),
  location: config.require('gcp:region'),
  description: 'Telemetry data for PayClearly Chrome Extension',
  defaultTableExpirationMs: 365 * 24 * 60 * 60 * 1000, // 1 year
  labels: {
    environment: pulumi.getStack(),
  },
});

// Create events table
const eventsTable = new gcp.bigquery.Table('extension-telemetry-events', {
  project: config.require('gcp:project'),
  datasetId: telemetryDataset.datasetId,
  tableId: config.require('bigQueryTable'),
  description: 'Extension telemetry events',
  schema: JSON.stringify([
    {
      name: 'event_id',
      type: 'STRING',
      mode: 'REQUIRED',
    },
    {
      name: 'event_type',
      type: 'STRING',
      mode: 'REQUIRED',
    },
    {
      name: 'timestamp',
      type: 'TIMESTAMP',
      mode: 'REQUIRED',
    },
    {
      name: 'operator_id',
      type: 'STRING',
      mode: 'NULLABLE',
    },
    {
      name: 'payment_id',
      type: 'STRING',
      mode: 'NULLABLE',
    },
    {
      name: 'portal_id',
      type: 'STRING',
      mode: 'NULLABLE',
    },
    {
      name: 'page_key',
      type: 'STRING',
      mode: 'NULLABLE',
    },
    {
      name: 'metadata',
      type: 'JSON',
      mode: 'NULLABLE',
    },
    {
      name: 'created_at',
      type: 'TIMESTAMP',
      mode: 'REQUIRED',
    },
  ]),
  timePartitioning: {
    type: 'DAY',
    field: 'timestamp',
  },
  clustering: ['event_type', 'operator_id'],
  labels: {
    environment: pulumi.getStack(),
  },
});

// Create service account for extension to write to BigQuery
const telemetryWriterServiceAccount = new gcp.serviceaccount.Account('telemetry-writer-sa', {
  accountId: 'telemetry-writer',
  displayName: 'Telemetry Writer Service Account',
});

// Grant BigQuery Data Editor role
const telemetryWriterBigQueryAccess = new gcp.projects.IAMMember(
  'telemetry-writer-bigquery-access',
  {
    project: config.require('gcp:project'),
    role: 'roles/bigquery.dataEditor',
    member: pulumi.interpolate`serviceAccount:${telemetryWriterServiceAccount.email}`,
  }
);

// Export service account email for extension config
export const telemetryWriterServiceAccountEmail = telemetryWriterServiceAccount.email;

