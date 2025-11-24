import { detectPortal } from './portalDetect';
import { detectFormFields } from './formDetect';
import { autofillForm } from './autofill';
import { startLearningMode, submitLearning } from './learning';
import { obfuscateSensitiveFields } from './obfuscate';
import { detectConfirmation, scrapeConfirmationMetadata } from './scrape';
import { logger } from '../shared/logger';

let portalDetected = false;
let currentPortalId: string | null = null;

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
    portalDetected = true;
    currentPortalId = portal.portalId;

    // Notify background
    chrome.runtime.sendMessage({
      type: 'PORTAL_DETECTED',
      portalId: portal.portalId,
      confidence: portal.confidence,
      pageKey: portal.pageKey,
    });

    // Obfuscate sensitive fields
    obfuscateSensitiveFields();

    // Wait for form to be ready
    setTimeout(() => {
      detectFormFields().then((fields) => {
        logger.debug('Form fields detected', { count: fields.length });
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
  const checkNavigation = () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      logger.info('Navigation detected', { url: lastUrl });
      // Re-detect portal after navigation
      setTimeout(() => {
        detectPortal().then((portal) => {
          if (portal) {
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

  // Check for navigation every 2 seconds
  setInterval(checkNavigation, 2000);

  // Also listen for popstate (back/forward)
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
}

async function handleMessage(message: unknown): Promise<void> {
  if (typeof message !== 'object' || message === null) {
    return;
  }

  const msg = message as { type: string; [key: string]: unknown };

  switch (msg.type) {
    case 'AUTOFILL':
      if (msg.template && msg.payment) {
        await autofillForm(msg.payment, msg.template);
      }
      break;

    case 'START_LEARNING':
      startLearningMode();
      break;

    default:
      logger.warn('Unknown message type', { type: msg.type });
  }
}

