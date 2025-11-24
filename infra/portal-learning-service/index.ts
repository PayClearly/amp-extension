import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

const config = new pulumi.Config();

// Create Firestore database (if not exists)
const firestoreDatabase = new gcp.firestore.Database('portal-learning-db', {
  project: config.require('gcp:project'),
  locationId: config.require('gcp:region'),
  type: 'FIRESTORE_NATIVE',
  name: 'portal-learning',
}, {
  protect: true, // Prevent accidental deletion
});

// Create service account
const portalLearningServiceAccount = new gcp.serviceaccount.Account(
  'portal-learning-service-account',
  {
    accountId: 'portal-learning-service',
    displayName: 'Portal Learning Service Account',
  }
);

// Grant Firestore access
const portalLearningFirestoreAccess = new gcp.projects.IAMMember(
  'portal-learning-firestore-access',
  {
    project: config.require('gcp:project'),
    role: 'roles/datastore.user',
    member: pulumi.interpolate`serviceAccount:${portalLearningServiceAccount.email}`,
  }
);

// Grant Secret Manager access
const portalLearningSecretAccess = new gcp.projects.IAMMember(
  'portal-learning-secret-access',
  {
    project: config.require('gcp:project'),
    role: 'roles/secretmanager.secretAccessor',
    member: pulumi.interpolate`serviceAccount:${portalLearningServiceAccount.email}`,
  }
);

// Create Cloud Run service
const portalLearningService = new gcp.cloudrun.Service('portal-learning-service', {
  location: config.require('gcp:region'),
  template: {
    spec: {
      serviceAccountName: portalLearningServiceAccount.email,
      containers: [
        {
          image: pulumi.interpolate`gcr.io/${config.require('gcp:project')}/portal-learning-service:latest`,
          ports: [
            {
              containerPort: 8080,
            },
          ],
          envs: [
            {
              name: 'PORT',
              value: '8080',
            },
            {
              name: 'GCP_PROJECT_ID',
              value: config.require('gcp:project'),
            },
            {
              name: 'FIRESTORE_DATABASE_ID',
              value: firestoreDatabase.name,
            },
            {
              name: 'TEMPLATE_SIGNING_PRIVATE_KEY_SECRET',
              value: config.require('templateSigningPrivateKeySecret'),
            },
          ],
          resources: {
            limits: {
              cpu: '1000m',
              memory: '512Mi',
            },
          },
        },
      ],
      containerConcurrency: 10,
      timeoutSeconds: 30,
    },
    metadata: {
      annotations: {
        'autoscaling.knative.dev/minScale': '0',
        'autoscaling.knative.dev/maxScale': '1',
        'run.googleapis.com/execution-environment': 'gen2',
      },
    },
  },
});

// Allow authenticated access
const portalLearningServiceIam = new gcp.cloudrun.IamMember('portal-learning-service-iam', {
  service: portalLearningService.name,
  location: portalLearningService.location,
  role: 'roles/run.invoker',
  member: 'allUsers', // Or restrict to specific service accounts
});

// Export service URL
export const portalLearningServiceUrl = portalLearningService.statuses[0].url;

