import type { FieldMapping } from '../shared/types';
import { identifyField } from './formDetect';
import { portalLearningService } from '../shared/apiClient';
import { logger } from '../shared/logger';

let learningMode = false;
let capturedFields: FieldMapping[] = [];

export function startLearningMode(): void {
  learningMode = true;
  capturedFields = [];

  // Observe form interactions
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('input', captureField, true);
    form.addEventListener('change', captureField, true);
  }

  logger.info('Learning mode started');
}

function captureField(event: Event): void {
  if (!learningMode) return;

  const element = event.target as HTMLElement;
  const mapping = identifyField(element);
  if (mapping && !capturedFields.find((f) => f.selector === mapping.selector)) {
    capturedFields.push(mapping);
    logger.debug('Field captured', { selector: mapping.selector, semanticType: mapping.semanticType });
  }
}

export async function submitLearning(payment: {
  portalId: string;
  accountId: string;
  clientId: string;
  vendorId: string;
}): Promise<void> {
  if (!learningMode || capturedFields.length === 0) {
    return;
  }

  const pageKey = inferPageKey();

  const payload = {
    portalId: payment.portalId,
    accountId: payment.accountId,
    clientId: payment.clientId,
    vendorId: payment.vendorId,
    pageKey,
    fields: capturedFields.map((f) => ({
      selector: f.selector,
      semanticType: f.semanticType,
      inputType: f.inputType,
      label: f.label,
      confidence: f.confidence,
    })),
    confidence: calculateConfidence(capturedFields),
    url: window.location.href,
    fingerprint: generateFingerprint(),
  };

  try {
    await portalLearningService.createTemplate(payload);
    logger.info('Template learned and submitted', { portalId: payment.portalId, pageKey });
  } catch (error) {
    logger.error('Failed to submit learning', error);
    throw error;
  }

  learningMode = false;
  capturedFields = [];
}

function inferPageKey(): string {
  const url = window.location.href.toLowerCase();
  if (url.includes('login') || url.includes('signin')) return 'login';
  if (url.includes('payment') || url.includes('pay')) return 'payment_form';
  if (url.includes('confirm') || url.includes('success')) return 'confirmation';
  return 'default';
}

function calculateConfidence(fields: FieldMapping[]): number {
  if (fields.length === 0) return 0;
  const avgConfidence = fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length;
  return Math.min(avgConfidence, 0.95); // Cap at 0.95
}

function generateFingerprint(): string {
  const landmarks = [
    document.querySelector('form')?.id,
    document.querySelector('form')?.getAttribute('action'),
    Array.from(document.querySelectorAll('button'))
      .map((b) => b.textContent?.trim())
      .filter(Boolean)
      .join('|'),
    document.title,
  ]
    .filter(Boolean)
    .join('||');

  return btoa(landmarks).substring(0, 32);
}

// Re-export identifyField from formDetect for use here
export { identifyField } from './formDetect';

