import { auth } from './auth';
import { stateMachine } from './stateMachine';
import { logger } from '../shared/logger';

// Initialize on service worker startup
chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed/updated');
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('Extension startup');
  // Restore state from storage
  stateMachine.restore();
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug('Message received', { message });

  switch (message.type) {
    case 'GET_NEXT_PAYMENT':
      stateMachine.handleGetNextPayment();
      sendResponse({ success: true });
      break;

    case 'STOP_AFTER_NEXT':
      stateMachine.handleStopAfterNext();
      sendResponse({ success: true });
      break;

    case 'CREATE_EXCEPTION':
      stateMachine.handleCreateException(message.paymentId, message.reason);
      sendResponse({ success: true });
      break;

    case 'PORTAL_DETECTED':
      stateMachine.handlePortalDetected(
        message.portalId,
        message.confidence,
        message.pageKey
      );
      sendResponse({ success: true });
      break;

    case 'CONFIRMATION_DETECTED':
      stateMachine.handleConfirmationDetected(message.metadata);
      sendResponse({ success: true });
      break;

    case 'AUTH_REQUIRED':
      auth.authenticate().then(() => {
        sendResponse({ success: true });
      });
      break;

    default:
      logger.warn('Unknown message type', { type: message.type });
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true; // Keep message channel open for async response
});

// Listen for tab updates to inject content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Content script will be injected automatically via manifest
    // But we can trigger portal detection here if needed
    logger.debug('Tab updated', { tabId, url: tab.url });
  }
});

// Periodic token refresh
setInterval(() => {
  auth.refreshTokenIfNeeded().catch((error) => {
    logger.error('Token refresh failed', error);
  });
}, 15 * 60 * 1000); // Every 15 minutes

logger.info('Background service worker initialized');

