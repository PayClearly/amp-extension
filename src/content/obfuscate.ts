import { identifyField } from './formDetect';
import { config } from '../shared/config';
import { logger } from '../shared/logger';

const SENSITIVE_SEMANTIC_TYPES = [
  'account_number',
  'routing_number',
  'card_number',
  'cvv',
  'email',
  'phone',
] as const;

// Fields that should use password type (credentials)
const PASSWORD_TYPE_SEMANTIC_TYPES = ['password', 'pin', 'mfa', '2fa'] as const;

// Fields that should use CSS masking (not password type)
const CSS_MASK_SEMANTIC_TYPES = [
  'account_number',
  'routing_number',
  'card_number',
  'cvv',
  'ssn',
  'tax_id',
] as const;

const SENSITIVE_KEYWORDS = [
  'password',
  'pin',
  'ssn',
  'social security',
  'tax id',
  'ein',
  'mfa',
  '2fa',
  'secret',
  'credential',
];

// Whitelist: Fields that should NOT be obfuscated
const WHITELIST_SEMANTIC_TYPES = ['amount', 'invoice_number'] as const;

// Track obfuscated elements to restore on form submit
const obfuscatedElements = new WeakMap<HTMLInputElement, { originalType: string; originalStyle: string }>();

export async function obfuscateSensitiveFields(): Promise<void> {
  // Check if obfuscation is enabled
  if (!config.obfuscationEnabled) {
    logger.debug('Obfuscation disabled');
    return;
  }

  const form = document.querySelector('form');
  if (!form) {
    logger.debug('No form found for obfuscation');
    return;
  }

  // Get all text inputs (including those that might be converted)
  const inputs = form.querySelectorAll('input[type="text"], input:not([type])');

  let obfuscatedCount = 0;

  for (const input of inputs) {
    const element = input as HTMLInputElement;

    // Skip if already obfuscated
    if (obfuscatedElements.has(element)) {
      continue;
    }

    const isSensitive = isSensitiveField(element);

    if (isSensitive) {
      obfuscateField(element);
      obfuscatedCount++;
    }
  }

  if (obfuscatedCount > 0) {
    logger.info('Obfuscated sensitive fields', { count: obfuscatedCount });
  }
}

function isSensitiveField(element: HTMLInputElement): boolean {
  // Check semantic type
  const mapping = identifyField(element);
  if (mapping) {
    // Whitelist check: don't obfuscate payment amount or invoice number
    if (WHITELIST_SEMANTIC_TYPES.includes(mapping.semanticType as any)) {
      return false;
    }

    // Check if sensitive semantic type
    if (SENSITIVE_SEMANTIC_TYPES.includes(mapping.semanticType as any)) {
      return true;
    }
  }

  // Check field name/label/id
  const name = (
    element.name ||
    element.id ||
    element.getAttribute('aria-label') ||
    element.getAttribute('placeholder') ||
    ''
  ).toLowerCase();

  // Whitelist check: don't obfuscate if name suggests it's payment amount or invoice
  if (name.includes('amount') || name.includes('invoice') || name.includes('total')) {
    return false;
  }

  // Check for sensitive keywords
  if (SENSITIVE_KEYWORDS.some((keyword) => name.includes(keyword))) {
    return true;
  }

  // Check for card number patterns (16 digits)
  if (element.value && /^\d{13,19}$/.test(element.value.replace(/\s/g, ''))) {
    const mapping = identifyField(element);
    if (mapping?.semanticType === 'card_number') {
      return true;
    }
  }

  return false;
}

function obfuscateField(element: HTMLInputElement): void {
  const mapping = identifyField(element);
  const semanticType = mapping?.semanticType || '';

  // Store original state
  obfuscatedElements.set(element, {
    originalType: element.type || 'text',
    originalStyle: element.style.cssText,
  });

  // Determine obfuscation method
  if (PASSWORD_TYPE_SEMANTIC_TYPES.includes(semanticType as any)) {
    // Use password type for credentials
    element.type = 'password';
    logger.debug('Obfuscated field with password type', {
      selector: getSelector(element),
      semanticType,
    });
  } else if (CSS_MASK_SEMANTIC_TYPES.includes(semanticType as any)) {
    // Use CSS masking for other sensitive fields
    // This preserves the input type but visually masks the value
    // Note: webkitTextSecurity is a non-standard CSS property, use type assertion
    (element.style as any).webkitTextSecurity = 'disc';
    (element.style as any).textSecurity = 'disc';
    logger.debug('Obfuscated field with CSS masking', {
      selector: getSelector(element),
      semanticType,
    });
  } else {
    // Default: use password type
    element.type = 'password';
    logger.debug('Obfuscated field with password type (default)', {
      selector: getSelector(element),
      semanticType,
    });
  }

  // Add data attribute for identification
  element.setAttribute('data-payclearly-obfuscated', 'true');
}

/**
 * Restore obfuscated field to original state
 * This is useful if the portal requires the original input type for validation
 */
export function restoreObfuscatedField(element: HTMLInputElement): void {
  const original = obfuscatedElements.get(element);
  if (!original) {
    return;
  }

  element.type = original.originalType;
  element.style.cssText = original.originalStyle;
  element.removeAttribute('data-payclearly-obfuscated');
  obfuscatedElements.delete(element);
}

/**
 * Restore all obfuscated fields in a form
 * Call this before form submission to ensure portal compatibility
 */
export function restoreAllObfuscatedFields(form?: HTMLFormElement): void {
  const targetForm = form || document.querySelector('form');
  if (!targetForm) {
    return;
  }

  const obfuscated = targetForm.querySelectorAll('[data-payclearly-obfuscated]');
  let restoredCount = 0;

  for (const element of obfuscated) {
    restoreObfuscatedField(element as HTMLInputElement);
    restoredCount++;
  }

  if (restoredCount > 0) {
    logger.info('Restored obfuscated fields', { count: restoredCount });
  }
}

function getSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${element.id}`;
  }
  // Check if it's an input element with name attribute
  if (element instanceof HTMLInputElement && element.name) {
    return `input[name="${element.name}"]`;
  }
  return element.tagName.toLowerCase();
}

