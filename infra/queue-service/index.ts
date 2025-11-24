import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

const config = new pulumi.Config();

// Get service account
const queueServiceAccount = new gcp.serviceaccount.Account('queue-service-account', {
  accountId: 'queue-service',
  displayName: 'Queue Passthrough Service Account',
});

// Grant Cloud Run invoker role
const queueServiceInvoker = new gcp.projects.IAMMember('queue-service-invoker', {
  project: config.require('gcp:project'),
  role: 'roles/run.invoker',
  member: pulumi.interpolate`serviceAccount:${queueServiceAccount.email}`,
});

// Create Cloud Run service
const queueService = new gcp.cloudrun.Service(
  'queue-service',
  {
    location: config.require('gcp:region'),
    template: {
      spec: {
        serviceAccountName: queueServiceAccount.email,
        containers: [
          {
            image: pulumi.interpolate`gcr.io/${config.require('gcp:project')}/queue-service:latest`,
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
                name: 'QUEUE_SERVICE_URL',
                value: config.require('queueServiceUrl'),
              },
              {
                name: 'PAYMENT_SERVICE_URL',
                value: config.require('paymentServiceUrl'),
              },
              {
                name: 'PSOP_SERVICE_URL',
                value: config.require('psopServiceUrl'),
              },
              {
                name: 'AUTH_SERVICE_URL',
                value: config.require('authServiceUrl'),
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
        timeoutSeconds: 60,
      },
      metadata: {
        annotations: {
          'autoscaling.knative.dev/minScale': '0',
          'autoscaling.knative.dev/maxScale': '1',
          'run.googleapis.com/execution-environment': 'gen2',
        },
      },
    },
  },
  {
    protect: false, // Set to true in production
  }
);

// Allow unauthenticated access (or use IAM for authenticated)
const queueServiceIam = new gcp.cloudrun.IamMember('queue-service-iam', {
  service: queueService.name,
  location: queueService.location,
  role: 'roles/run.invoker',
  member: 'allUsers', // Or restrict to specific service accounts
});

// Export service URL
export const queueServiceUrl = queueService.statuses[0].url;

