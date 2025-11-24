import type { FieldMapping } from '../shared/types';
import { generateSelector, findLabel, findNearbyLabel } from '../shared/selectors';

export async function detectFormFields(): Promise<FieldMapping[]> {
  const fields: FieldMapping[] = [];
  const form = document.querySelector('form');
  if (!form) return fields;

  // Wait for DOM stability
  await waitForStableDOM(500);

  const inputs = form.querySelectorAll('input, select, textarea');

  for (const input of inputs) {
    const mapping = identifyField(input as HTMLElement);
    if (mapping) {
      fields.push(mapping);
    }
  }

  return fields;
}

function identifyField(element: HTMLElement): FieldMapping | null {
  // 1. Check label/for relationship
  const label = findLabel(element);
  if (label) {
    const semanticType = inferSemanticType(label.textContent || '');
    if (semanticType) {
      return {
        selector: generateSelector(element),
        semanticType,
        confidence: 0.8,
        inputType: (element as HTMLInputElement).type || 'text',
        label: label.textContent || undefined,
      };
    }
  }

  // 2. Check name/id/aria-label
  const name =
    (element as HTMLInputElement).name ||
    element.id ||
    element.getAttribute('aria-label') ||
    '';
  const semanticType = inferSemanticType(name);
  if (semanticType) {
    return {
      selector: generateSelector(element),
      semanticType,
      confidence: 0.7,
      inputType: (element as HTMLInputElement).type || 'text',
    };
  }

  // 3. Proximity heuristics (label near input)
  const nearbyLabel = findNearbyLabel(element);
  if (nearbyLabel) {
    const semanticType = inferSemanticType(nearbyLabel.textContent || '');
    if (semanticType) {
      return {
        selector: generateSelector(element),
        semanticType,
        confidence: 0.6,
        inputType: (element as HTMLInputElement).type || 'text',
        label: nearbyLabel.textContent || undefined,
      };
    }
  }

  return null;
}

function inferSemanticType(text: string): FieldMapping['semanticType'] | null {
  const lower = text.toLowerCase();
  if (lower.match(/amount|total|payment|price|cost/)) return 'amount';
  if (lower.match(/invoice|inv#|invoice number/)) return 'invoice_number';
  if (lower.match(/account.*number|account#/)) return 'account_number';
  if (lower.match(/routing|routing number|aba/)) return 'routing_number';
  if (lower.match(/card.*number|card#|credit card/)) return 'card_number';
  if (lower.match(/expir|exp date|mm\/yy/)) return 'expiry';
  if (lower.match(/cvv|cvc|security code/)) return 'cvv';
  if (lower.match(/email|e-mail/)) return 'email';
  if (lower.match(/phone|tel/)) return 'phone';
  if (lower.match(/date/)) return 'date';
  return 'text';
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

