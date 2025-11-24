import type { ExtensionNotification } from './types';

export type ExtensionMessage =
  | { type: 'GET_NEXT_PAYMENT' }
  | { type: 'STOP_AFTER_NEXT' }
  | { type: 'CREATE_EXCEPTION'; paymentId: string; reason: string }
  | { type: 'PORTAL_DETECTED'; portalId: string; confidence: number; pageKey: string }
  | { type: 'CONFIRMATION_DETECTED'; metadata: unknown }
  | { type: 'NOTIFICATION'; notification: ExtensionNotification }
  | { type: 'STATE_CHANGED'; state: string }
  | { type: 'AUTH_REQUIRED' }
  | { type: 'AUTH_SUCCESS' };

export const NOTIFICATION_CATALOG = {
  AUTOFILL_COMPLETE: {
    type: 'NEXT_STEP_REQUIRED' as const,
    messageKey: 'AUTOFILL_COMPLETE',
    humanMessage: 'Form auto-filled. Click Submit.',
    blocking: true,
  },
  CAPTCHA_DETECTED: {
    type: 'NEXT_STEP_REQUIRED' as const,
    messageKey: 'CAPTCHA_DETECTED',
    humanMessage: 'Captcha detected. Please solve manually.',
    blocking: true,
  },
  LEARNING_MODE: {
    type: 'NEXT_STEP_REQUIRED' as const,
    messageKey: 'LEARNING_MODE',
    humanMessage: 'Learning mode. Please fill form manually.',
    blocking: false,
  },
  CAPTURING_EVIDENCE: {
    type: 'AUTO_ACTION_IN_PROGRESS' as const,
    messageKey: 'CAPTURING_EVIDENCE',
    humanMessage: 'Capturing screenshot...',
    blocking: true,
  },
  UPLOADING_EVIDENCE: {
    type: 'AUTO_ACTION_IN_PROGRESS' as const,
    messageKey: 'UPLOADING_EVIDENCE',
    humanMessage: 'Uploading evidence...',
    blocking: true,
  },
  FETCHING_PAYMENT: {
    type: 'AUTO_ACTION_IN_PROGRESS' as const,
    messageKey: 'FETCHING_PAYMENT',
    humanMessage: 'Fetching next payment...',
    blocking: true,
  },
  EVIDENCE_UPLOADED: {
    type: 'AUTO_ACTION_COMPLETE' as const,
    messageKey: 'EVIDENCE_UPLOADED',
    humanMessage: 'Evidence uploaded. Ready.',
    blocking: false,
  },
  PAYMENT_COMPLETED: {
    type: 'AUTO_ACTION_COMPLETE' as const,
    messageKey: 'PAYMENT_COMPLETED',
    humanMessage: 'Payment completed. Evidence uploaded.',
    blocking: false,
  },
  TEMPLATE_LEARNED: {
    type: 'AUTO_ACTION_COMPLETE' as const,
    messageKey: 'TEMPLATE_LEARNED',
    humanMessage: 'Template learned. Capturing evidence...',
    blocking: false,
  },
  EXCEPTION_CREATED: {
    type: 'AUTO_ACTION_COMPLETE' as const,
    messageKey: 'EXCEPTION_CREATED',
    humanMessage: 'Exception created. Payment parked.',
    blocking: false,
  },
  TEMPLATE_LOW_CONFIDENCE: {
    type: 'WARNING' as const,
    messageKey: 'TEMPLATE_LOW_CONFIDENCE',
    humanMessage: 'Template confidence low. Please verify fields.',
    blocking: false,
  },
  TEMPLATE_MISMATCH: {
    type: 'WARNING' as const,
    messageKey: 'TEMPLATE_MISMATCH',
    humanMessage: 'Template mismatch detected. Please verify.',
    blocking: false,
  },
  TOKEN_EXPIRED: {
    type: 'ERROR' as const,
    messageKey: 'TOKEN_EXPIRED',
    humanMessage: 'Authentication expired. Please refresh.',
    blocking: true,
  },
  EVIDENCE_UPLOAD_FAILED: {
    type: 'ERROR' as const,
    messageKey: 'EVIDENCE_UPLOAD_FAILED',
    humanMessage: 'Evidence upload failed. Retry?',
    blocking: true,
  },
  PAYMENT_FETCH_FAILED: {
    type: 'ERROR' as const,
    messageKey: 'PAYMENT_FETCH_FAILED',
    humanMessage: 'Failed to fetch payment. Retry?',
    blocking: true,
  },
  PORTAL_DETECTION_FAILED: {
    type: 'ERROR' as const,
    messageKey: 'PORTAL_DETECTION_FAILED',
    humanMessage: 'Portal detection failed. Please continue manually.',
    blocking: false,
  },
};

export function createNotification(
  catalogKey: keyof typeof NOTIFICATION_CATALOG,
  overrides?: Partial<ExtensionNotification>
): ExtensionNotification {
  const base = NOTIFICATION_CATALOG[catalogKey];
  return {
    ...base,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

