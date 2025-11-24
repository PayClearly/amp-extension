import type { Payment, PortalTemplate } from '../shared/types';
import { config } from '../shared/config';
import { logger } from '../shared/logger';
import { createNotification } from '../shared/events';

export async function autofillForm(
  payment: Payment,
  template: PortalTemplate
): Promise<{ success: boolean; fieldsFilled: number; errors: string[] }> {
  const form = document.querySelector('form');
  if (!form) {
    return { success: false, fieldsFilled: 0, errors: ['Form not found'] };
  }

  // Check confidence threshold
  if (template.confidence < config.templateConfidenceThreshold) {
    logger.warn('Template confidence below threshold', {
      confidence: template.confidence,
      threshold: config.templateConfidenceThreshold,
    });
    return { success: false, fieldsFilled: 0, errors: ['Confidence too low'] };
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
      errors.push(
        `Failed to fill ${fieldMapping.selector}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Emit notification
  chrome.runtime.sendMessage({
    type: 'NOTIFICATION',
    notification: createNotification('AUTOFILL_COMPLETE', {
      paymentId: payment.id,
      portalId: template.portalId,
      pageKey: template.pageKey,
    }),
  });

  logger.info('Autofill completed', { fieldsFilled, errors: errors.length });

  return { success: fieldsFilled > 0, fieldsFilled, errors };
}

function fillField(element: HTMLInputElement, value: string): void {
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

function getPaymentValue(
  payment: Payment,
  semanticType: string
): string | null {
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

function waitForStableDOM(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let lastMutation = Date.now();
    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    const check = () => {
      if (Date.now() - lastMutation >= ms) {
        observer.disconnect();
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };

    setTimeout(check, ms);
  });
}

