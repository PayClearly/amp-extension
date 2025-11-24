import type { PortalDetectionResult } from '../shared/types';
import { logger } from '../shared/logger';

export async function detectPortal(): Promise<PortalDetectionResult | null> {
  // 1. Check URL patterns
  const urlMatch = matchUrlPatterns(window.location.href);
  if (urlMatch) {
    return {
      portalId: urlMatch.portalId,
      confidence: 0.9,
      pageKey: urlMatch.pageKey,
      url: window.location.href,
      fingerprint: generateFingerprint(),
    };
  }

  // 2. DOM fingerprinting
  const fingerprint = generateFingerprint();
  const domMatch = await matchDomFingerprint(fingerprint);
  if (domMatch && domMatch.confidence >= 0.7) {
    return {
      portalId: domMatch.portalId,
      confidence: domMatch.confidence,
      pageKey: domMatch.pageKey,
      url: window.location.href,
      fingerprint,
    };
  }

  // 3. Check if we have portal info from payment
  const payment = await getCurrentPayment();
  if (payment?.portalId) {
    return {
      portalId: payment.portalId,
      confidence: 0.6, // Lower confidence, needs verification
      pageKey: inferPageKey(),
      url: window.location.href,
      fingerprint,
    };
  }

  return null;
}

function matchUrlPatterns(url: string): { portalId: string; pageKey: string } | null {
  // TODO: Implement URL pattern matching
  // For now, return null (will be implemented based on known portals)
  return null;
}

function generateFingerprint(): string {
  // Stable landmarks: form IDs, button text, meta tags, title patterns
  const landmarks = [
    document.querySelector('form')?.id,
    document.querySelector('form')?.getAttribute('action'),
    Array.from(document.querySelectorAll('button'))
      .map((b) => b.textContent?.trim())
      .filter(Boolean)
      .join('|'),
    document.querySelector('meta[name="description"]')?.getAttribute('content'),
    document.title,
  ]
    .filter(Boolean)
    .join('||');

  // Simple hash (btoa for base64 encoding)
  return btoa(landmarks).substring(0, 32);
}

async function matchDomFingerprint(
  fingerprint: string
): Promise<{ portalId: string; pageKey: string; confidence: number } | null> {
  // TODO: Check against known fingerprints from Portal Learning Service
  // For now, return null
  return null;
}

function inferPageKey(): string {
  const url = window.location.href.toLowerCase();
  if (url.includes('login') || url.includes('signin')) return 'login';
  if (url.includes('payment') || url.includes('pay')) return 'payment_form';
  if (url.includes('confirm') || url.includes('success')) return 'confirmation';
  return 'default';
}

async function getCurrentPayment(): Promise<{ portalId: string | null } | null> {
  try {
    const result = await chrome.storage.session.get('stateContext');
    const stateContext = result.stateContext;
    if (stateContext && stateContext.payment) {
      return {
        portalId: stateContext.payment.portalId || null,
      };
    }
  } catch (error) {
    logger.error('Failed to get current payment', error);
  }
  return null;
}

