import { identifyField } from './formDetect';

const SENSITIVE_SEMANTIC_TYPES = [
  'account_number',
  'routing_number',
  'card_number',
  'cvv',
  'email',
  'phone',
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

export async function obfuscateSensitiveFields(): Promise<void> {
  const form = document.querySelector('form');
  if (!form) return;

  const inputs = form.querySelectorAll('input[type="text"]');

  for (const input of inputs) {
    const element = input as HTMLInputElement;
    const isSensitive = isSensitiveField(element);

    if (isSensitive) {
      // Convert to password type
      element.type = 'password';
    }
  }
}

function isSensitiveField(element: HTMLInputElement): boolean {
  // Check semantic type
  const mapping = identifyField(element);
  if (mapping && SENSITIVE_SEMANTIC_TYPES.includes(mapping.semanticType as any)) {
    return true;
  }

  // Check field name/label
  const name = (
    element.name ||
    element.id ||
    element.getAttribute('aria-label') ||
    ''
  ).toLowerCase();
  if (SENSITIVE_KEYWORDS.some((keyword) => name.includes(keyword))) {
    return true;
  }

  return false;
}

