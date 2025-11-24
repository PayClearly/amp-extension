/**
 * Portal URL pattern matching
 * Patterns are matched in order, first match wins
 */

export interface PortalPattern {
  portalId: string;
  patterns: Array<{
    host: string | RegExp;
    path?: string | RegExp;
    pageKey?: string;
  }>;
}

// TODO: Load portal patterns from backend API or configuration file
// Known portal patterns (can be extended or loaded from backend)
const PORTAL_PATTERNS: PortalPattern[] = [
  // Test portal patterns (for local testing)
  {
    portalId: 'portal_test',
    patterns: [
      {
        host: /localhost/i,
        path: /\/login/i,
        pageKey: 'login',
      },
      {
        host: /localhost/i,
        path: /\/payment/i,
        pageKey: 'payment_form',
      },
      {
        host: /localhost/i,
        path: /\/confirmation/i,
        pageKey: 'confirmation',
      },
      {
        host: /127\.0\.0\.1/i,
        path: /\/login/i,
        pageKey: 'login',
      },
      {
        host: /127\.0\.0\.1/i,
        path: /\/payment/i,
        pageKey: 'payment_form',
      },
      {
        host: /127\.0\.0\.1/i,
        path: /\/confirmation/i,
        pageKey: 'confirmation',
      },
    ],
  },
  // Example patterns - replace with actual vendor portals
  // TODO: Add real vendor portal patterns based on production data
  {
    portalId: 'portal_example',
    patterns: [
      {
        host: /portal\.example\.com$/i,
        path: /\/payment/i,
        pageKey: 'payment_form',
      },
      {
        host: /portal\.example\.com$/i,
        path: /\/confirm/i,
        pageKey: 'confirmation',
      },
    ],
  },
];

/**
 * Match URL against portal patterns
 */
export function matchUrlPatterns(url: string): { portalId: string; pageKey: string } | null {
  try {
    const urlObj = new URL(url);

    for (const portal of PORTAL_PATTERNS) {
      for (const pattern of portal.patterns) {
        // Match host
        const hostMatch =
          typeof pattern.host === 'string'
            ? urlObj.hostname === pattern.host
            : pattern.host.test(urlObj.hostname);

        if (!hostMatch) {
          continue;
        }

        // Match path (if specified)
        if (pattern.path) {
          const pathMatch =
            typeof pattern.path === 'string'
              ? urlObj.pathname === pattern.path
              : pattern.path.test(urlObj.pathname);

          if (!pathMatch) {
            continue;
          }
        }

        // Match found
        return {
          portalId: portal.portalId,
          pageKey: pattern.pageKey || inferPageKeyFromUrl(url),
        };
      }
    }
  } catch (error) {
    // Invalid URL
    return null;
  }

  return null;
}

/**
 * Infer page key from URL
 */
function inferPageKeyFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('login') || lower.includes('signin')) return 'login';
  if (lower.includes('payment') || lower.includes('pay')) return 'payment_form';
  if (lower.includes('confirm') || lower.includes('success')) return 'confirmation';
  return 'default';
}

/**
 * Load portal patterns from backend (future enhancement)
 */
export async function loadPortalPatterns(): Promise<PortalPattern[]> {
  // TODO: Fetch from backend API endpoint (e.g., /api/v1/portals/patterns)
  // Should cache patterns in chrome.storage.local and refresh periodically
  // For now, return static patterns
  return PORTAL_PATTERNS;
}

