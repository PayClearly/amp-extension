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

  // Emit notification based on result
  if (fieldsFilled > 0) {
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      notification: createNotification('AUTOFILL_COMPLETE', {
        paymentId: payment.id,
        portalId: template.portalId,
        pageKey: template.pageKey,
      }),
    });

    // Telemetry
    chrome.runtime.sendMessage({
      type: 'TELEMETRY',
      event: {
        eventType: 'autofill_succeeded',
        timestamp: new Date().toISOString(),
        paymentId: payment.id,
        portalId: template.portalId,
        pageKey: template.pageKey,
        metadata: {
          fieldsFilled,
          totalFields: template.fields.length,
          errors: errors.length,
        },
      },
    }).catch(() => {
      // Ignore telemetry errors
    });
  } else {
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      notification: createNotification('WARNING', {
        messageKey: 'AUTOFILL_FAILED',
        humanMessage: 'Autofill failed. Please fill form manually.',
        paymentId: payment.id,
        portalId: template.portalId,
        pageKey: template.pageKey,
      }),
    });

    // Telemetry
    chrome.runtime.sendMessage({
      type: 'TELEMETRY',
      event: {
        eventType: 'autofill_failed',
        timestamp: new Date().toISOString(),
        paymentId: payment.id,
        portalId: template.portalId,
        pageKey: template.pageKey,
        metadata: { errors },
      },
    }).catch(() => {
      // Ignore telemetry errors
    });
  }

  logger.info('Autofill completed', { fieldsFilled, errors: errors.length });

  return { success: fieldsFilled > 0, fieldsFilled, errors };
}

function fillField(element: HTMLInputElement, value: string): void {
  // TODO: Enhance field filling for different input types (select, textarea, etc.)
  // TODO: Handle special cases like masked inputs, date pickers, etc.

  // Set value directly (works for most input types)
  element.value = value;

  // Trigger native events for React/Vue/Angular compatibility
  // Input event (most frameworks listen to this)
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  // Change event (for form validation)
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

  // Focus and blur to trigger any focus-based validation
  element.focus();
  element.blur();

  // Additional events for maximum compatibility
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

  // For React specifically, also trigger a synthetic event-like behavior
  // by setting the value property directly (already done above)

  // Wait a tick to ensure framework has processed the change
  setTimeout(() => {
    // Trigger one more change event after framework has had time to process
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, 0);
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

