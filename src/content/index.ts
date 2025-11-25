import { detectPortal } from './portalDetect';
import { detectFormFields } from './formDetect';
import { autofillForm } from './autofill';
import { startLearningMode, submitLearning } from './learning';
import { obfuscateSensitiveFields, restoreAllObfuscatedFields } from './obfuscate';
import { detectConfirmation, scrapeConfirmationMetadata } from './scrape';
import { initSmartAutofill } from './smartAutofill';
import { logger } from '../shared/logger';
import type { Payment, PortalTemplate } from '../shared/types';

// Track portal detection state (used for debugging/logging)
// let portalDetected = false;
// let currentPortalId: string | null = null;

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init(): Promise<void> {
  logger.info('Content script initialized', { url: window.location.href });

  // Detect portal
  const portal = await detectPortal();
  if (portal) {
    // portalDetected = true;
    // currentPortalId = portal.portalId;

    // Notify background
    chrome.runtime.sendMessage({
      type: 'PORTAL_DETECTED',
      portalId: portal.portalId,
      confidence: portal.confidence,
      pageKey: portal.pageKey,
    });

    // Obfuscate sensitive fields
    obfuscateSensitiveFields();

    // Wait for form to be ready, then check if we should enable smart autofill
    setTimeout(() => {
      detectFormFields().then((fields) => {
        logger.debug('Form fields detected', { count: fields.length });
      });

      // Check if we're in learning mode (no template) and have payment data
      chrome.storage.session.get('stateContext', (result) => {
        const stateContext = result.stateContext;
        if (stateContext?.state === 'LEARNING' || stateContext?.state === 'ACTIVE') {
          const payment = stateContext.payment as Payment | null;
          const template = stateContext.template as PortalTemplate | null;

          // Enable smart autofill if no template exists
          if (payment && !template) {
            logger.info('No template found, enabling smart autofill');
            initSmartAutofill(payment);
          }
        }
      });
    }, 500);
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        logger.error('Message handling failed', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open
  });

  // Monitor for SPA navigation
  let lastUrl = window.location.href;
  let navigationCheckTimeout: number | null = null;

  const checkNavigation = (): void => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      logger.info('Navigation detected', { url: lastUrl });

      // Reset portal detection state
      // portalDetected = false;
      // currentPortalId = null;

      // Re-detect portal after navigation (debounced)
      if (navigationCheckTimeout) {
        clearTimeout(navigationCheckTimeout);
      }
      navigationCheckTimeout = window.setTimeout(() => {
        detectPortal().then((portal) => {
          if (portal) {
            // portalDetected = true;
            // currentPortalId = portal.portalId;
            chrome.runtime.sendMessage({
              type: 'PORTAL_DETECTED',
              portalId: portal.portalId,
              confidence: portal.confidence,
              pageKey: portal.pageKey,
            });
          }
        });
      }, 1000);
    }
  };

  // Intercept pushState and replaceState for SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(history, args);
    setTimeout(checkNavigation, 100);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    setTimeout(checkNavigation, 100);
  };

  // Check for navigation every 2 seconds (fallback)
  setInterval(checkNavigation, 2000);

  // Listen for popstate (back/forward)
  window.addEventListener('popstate', () => {
    setTimeout(checkNavigation, 500);
  });

  // Monitor for confirmation page
  const checkConfirmation = () => {
    detectConfirmation().then((isConfirmation) => {
      if (isConfirmation) {
        scrapeConfirmationMetadata().then((metadata) => {
          chrome.runtime.sendMessage({
            type: 'CONFIRMATION_DETECTED',
            metadata,
          });
        });
      }
    });
  };

  // Check for confirmation every 5 seconds
  setInterval(checkConfirmation, 5000);

  // Intercept form submissions to restore obfuscated fields
  // This ensures portal validation works correctly
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (form && form.tagName === 'FORM') {
      // Restore obfuscated fields before submission
      restoreAllObfuscatedFields(form);
      logger.debug('Form submission intercepted, restored obfuscated fields');
    }
  }, true); // Use capture phase to intercept before form validation
}

async function handleMessage(message: unknown): Promise<void> {
  if (typeof message !== 'object' || message === null) {
    return;
  }

  const msg = message as { type: string;[key: string]: unknown };

  switch (msg.type) {
    case 'AUTOFILL':
      if (msg.template && msg.payment) {
        try {
          const result = await autofillForm(msg.payment as Payment, msg.template as PortalTemplate);
          logger.info('Autofill handled', result);
        } catch (error) {
          logger.error('Autofill failed', error);
          chrome.runtime.sendMessage({
            type: 'NOTIFICATION',
            notification: {
              type: 'ERROR',
              messageKey: 'AUTOFILL_ERROR',
              humanMessage: 'Autofill encountered an error. Please fill form manually.',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
      break;

    case 'START_LEARNING':
      startLearningMode();
      logger.info('Learning mode started via message');

      // Enable smart autofill when learning mode starts
      chrome.storage.session.get('stateContext', (result) => {
        const stateContext = result.stateContext;
        if (stateContext?.payment) {
          const payment = stateContext.payment as Payment;
          initSmartAutofill(payment);
        }
      });
      break;

    case 'SUBMIT_LEARNING':
      // TODO: Get payment data from background state
      // For now, try to get from storage
      chrome.storage.session.get('stateContext', async (result) => {
        const stateContext = result.stateContext;
        if (stateContext?.payment) {
          const payment = stateContext.payment;
          await submitLearning({
            portalId: stateContext.portalId || 'unknown',
            accountId: payment.accountId,
            clientId: payment.clientId,
            vendorId: payment.vendorId,
          });
        }
      });
      break;

    case 'AUTOFILL_REQUEST':
      // Manual autofill trigger (for testing)
      chrome.storage.session.get('stateContext', async (result) => {
        const stateContext = result.stateContext;
        if (stateContext?.payment && stateContext?.template) {
          const payment = stateContext.payment as Payment;
          const template = stateContext.template as PortalTemplate;
          logger.info('Manual autofill triggered');
          await autofillForm(payment, template);
        } else {
          logger.warn('Cannot autofill: missing payment or template', {
            hasPayment: !!stateContext?.payment,
            hasTemplate: !!stateContext?.template,
          });
          chrome.runtime.sendMessage({
            type: 'NOTIFICATION',
            notification: {
              type: 'WARNING',
              messageKey: 'AUTOFILL_ERROR',
              humanMessage: 'Cannot autofill: No payment or template available. Fetch a payment first.',
              timestamp: new Date().toISOString(),
            },
          });
        }
      });
      break;

    default:
      logger.warn('Unknown message type', { type: msg.type });
  }
}

