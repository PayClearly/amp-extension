/**
 * Smart Autofill: Infers field values from payment data when no template exists
 * Shows context menu overlay on input fields with suggested values
 */

import type { Payment } from '../shared/types';
import { identifyField } from './formDetect';
import { logger } from '../shared/logger';

const STANDARD_CREDENTIAL_FIELDS: Record<string, { key: string; name: string }> = {
  '01': { key: '01', name: 'Username' },
  '02': { key: '02', name: 'Password' },
  '03': { key: '03', name: 'Zip' },
  '04': { key: '04', name: 'Company Name' },
  '05': { key: '05', name: 'Customer ID' },
  '06': { key: '06', name: 'Company ZIP' },
  '07': { key: '07', name: 'Account Number' },
  '08': { key: '08', name: 'Supplier Specific Field' },
} as const;

interface FieldSuggestion {
  value: string;
  label: string;
  confidence: number;
  source: 'paymentFields' | 'cards' | 'credentialFields' | 'virtualCard' | 'accountMetadata';
}

/**
 * Infer what value should go in a field based on its label/id/name
 */
export function inferFieldValue(element: HTMLInputElement, payment: Payment): FieldSuggestion | null {
  const fieldInfo = identifyField(element);
  const label = fieldInfo?.label || '';
  const name = element.name || element.id || element.getAttribute('aria-label') || '';
  const placeholder = element.placeholder || '';

  // Combine all text for matching
  const searchText = `${label} ${name} ${placeholder}`.toLowerCase();

  // Try to match against payment data
  const suggestions: FieldSuggestion[] = [];

  // 1. Check paymentFields
  if (payment.paymentFields) {
    for (const [key, value] of Object.entries(payment.paymentFields)) {
      if (matchesField(searchText, key)) {
        suggestions.push({
          value: String(value),
          label: key,
          confidence: 0.8,
          source: 'paymentFields',
        });
      }
    }
  }

  // 2. Check credentialFields
  if (payment.credentialFields) {
    for (const [key, value] of Object.entries(payment.credentialFields)) {
      if (!value) continue;

      const credField = STANDARD_CREDENTIAL_FIELDS[key];
      if (credField && matchesField(searchText, credField.name)) {
        suggestions.push({
          value: String(value),
          label: credField.name,
          confidence: 0.9,
          source: 'credentialFields',
        });
      }
    }
  }

  // 3. Check cards (virtual card data)
  if (payment.cards && payment.cards.length > 0) {
    const card = payment.cards[0];

    if (matchesField(searchText, 'card number') || matchesField(searchText, 'card#')) {
      suggestions.push({
        value: card.cardNumber,
        label: 'Card Number',
        confidence: 0.9,
        source: 'cards',
      });
    }

    if (matchesField(searchText, 'expir') || matchesField(searchText, 'exp date')) {
      const expiry = `${card.expirationMonth}/${card.expirationYear.slice(-2)}`;
      suggestions.push({
        value: expiry,
        label: 'Expiry Date',
        confidence: 0.9,
        source: 'cards',
      });
    }

    if (matchesField(searchText, 'cvv') || matchesField(searchText, 'cvc') || matchesField(searchText, 'security code')) {
      suggestions.push({
        value: card.cvv,
        label: 'CVV',
        confidence: 0.9,
        source: 'cards',
      });
    }
  }

  // 4. Check virtualCard (fallback)
  if (payment.virtualCard) {
    if (matchesField(searchText, 'card number') || matchesField(searchText, 'card#')) {
      suggestions.push({
        value: payment.virtualCard.cardNumber,
        label: 'Card Number',
        confidence: 0.8,
        source: 'virtualCard',
      });
    }

    if (matchesField(searchText, 'expir') || matchesField(searchText, 'exp date')) {
      suggestions.push({
        value: payment.virtualCard.expiry,
        label: 'Expiry Date',
        confidence: 0.8,
        source: 'virtualCard',
      });
    }

    if (matchesField(searchText, 'cvv') || matchesField(searchText, 'cvc')) {
      suggestions.push({
        value: payment.virtualCard.cvv,
        label: 'CVV',
        confidence: 0.8,
        source: 'virtualCard',
      });
    }

    if (matchesField(searchText, 'account number') && payment.virtualCard.accountNumber) {
      suggestions.push({
        value: payment.virtualCard.accountNumber,
        label: 'Account Number',
        confidence: 0.8,
        source: 'virtualCard',
      });
    }
  }

  // 5. Check accountMetadata
  if (payment.accountMetadata) {
    if (matchesField(searchText, 'email') && payment.accountMetadata.contactEmail) {
      suggestions.push({
        value: payment.accountMetadata.contactEmail,
        label: 'Email',
        confidence: 0.8,
        source: 'accountMetadata',
      });
    }

    if (matchesField(searchText, 'phone') && payment.accountMetadata.contactPhone) {
      suggestions.push({
        value: payment.accountMetadata.contactPhone,
        label: 'Phone',
        confidence: 0.8,
        source: 'accountMetadata',
      });
    }

    if (matchesField(searchText, 'zip') && payment.accountMetadata.address?.zipCode) {
      suggestions.push({
        value: payment.accountMetadata.address.zipCode,
        label: 'Zip Code',
        confidence: 0.8,
        source: 'accountMetadata',
      });
    }
  }

  // 6. Check basic payment fields
  if (matchesField(searchText, 'amount') || matchesField(searchText, 'total') || matchesField(searchText, 'payment')) {
    suggestions.push({
      value: payment.amount.toFixed(2),
      label: 'Amount',
      confidence: 0.7,
      source: 'paymentFields',
    });
  }

  if (matchesField(searchText, 'invoice') && payment.invoiceNumbers.length > 0) {
    suggestions.push({
      value: payment.invoiceNumbers[0],
      label: 'Invoice Number',
      confidence: 0.7,
      source: 'paymentFields',
    });
  }

  // Return best match (highest confidence)
  if (suggestions.length > 0) {
    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions[0];
  }

  return null;
}

function matchesField(searchText: string, fieldName: string): boolean {
  const normalized = searchText.toLowerCase();
  const fieldLower = fieldName.toLowerCase();

  // Exact match
  if (normalized.includes(fieldLower)) {
    return true;
  }

  // Partial word matches
  const fieldWords = fieldLower.split(/\s+/);
  const matchCount = fieldWords.filter(word =>
    word.length > 2 && normalized.includes(word)
  ).length;

  // Match if at least 50% of words match
  return matchCount >= Math.ceil(fieldWords.length * 0.5);
}

/**
 * Create and show context menu overlay for an input field
 */
export function showContextMenu(element: HTMLInputElement, suggestion: FieldSuggestion): void {
  // Remove existing overlay if any
  const existing = document.querySelector('.payclearly-autofill-overlay');
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'payclearly-autofill-overlay';
  overlay.innerHTML = `
    <div class="payclearly-autofill-menu">
      <div class="payclearly-autofill-header">
        <span class="payclearly-autofill-icon">💳</span>
        <span class="payclearly-autofill-label">${suggestion.label}</span>
      </div>
      <button class="payclearly-autofill-button" data-value="${escapeHtml(suggestion.value)}">
        Fill ${escapeHtml(suggestion.value)}
      </button>
    </div>
  `;

  // Position overlay near the input
  const rect = element.getBoundingClientRect();
  overlay.style.position = 'fixed';
  overlay.style.top = `${rect.bottom + 5}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.zIndex = '10000';

  document.body.appendChild(overlay);

  // Handle click to fill
  const button = overlay.querySelector('.payclearly-autofill-button') as HTMLButtonElement;
  button.addEventListener('click', () => {
    fillField(element, suggestion.value);
    overlay.remove();
    logger.info('Field filled via smart autofill', {
      label: suggestion.label,
      source: suggestion.source,
    });
  });

  // Remove on outside click or when input loses focus
  const removeOverlay = () => {
    overlay.remove();
  };

  setTimeout(() => {
    document.addEventListener('click', removeOverlay, { once: true, capture: true });
    element.addEventListener('blur', removeOverlay, { once: true });
  }, 100);
}

function fillField(element: HTMLInputElement, value: string): void {
  element.value = value;

  // Trigger events for React/Vue compatibility
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.focus();
  element.blur();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Inject CSS for the overlay
 */
export function injectOverlayStyles(): void {
  if (document.getElementById('payclearly-autofill-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'payclearly-autofill-styles';
  style.textContent = `
    .payclearly-autofill-overlay {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 14px;
    }

    .payclearly-autofill-menu {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 8px;
      min-width: 200px;
    }

    .payclearly-autofill-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e0e0e0;
    }

    .payclearly-autofill-icon {
      font-size: 16px;
    }

    .payclearly-autofill-label {
      font-weight: 500;
      color: #333;
      font-size: 13px;
    }

    .payclearly-autofill-button {
      width: 100%;
      padding: 8px 12px;
      background: #0088ff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background-color 0.2s;
    }

    .payclearly-autofill-button:hover {
      background: #0077ee;
    }

    .payclearly-autofill-button:active {
      background: #0066dd;
    }
  `;

  document.head.appendChild(style);
}

/**
 * Initialize smart autofill for all form inputs
 */
export function initSmartAutofill(payment: Payment): void {
  injectOverlayStyles();

  const form = document.querySelector('form');
  if (!form) {
    logger.warn('No form found for smart autofill');
    return;
  }

  const inputs = form.querySelectorAll('input[type="text"], input:not([type]), input[type="email"], input[type="tel"], input[type="number"]');

  inputs.forEach((input) => {
    const element = input as HTMLInputElement;

    // Skip if already has value
    if (element.value) {
      return;
    }

    // Show overlay on focus
    element.addEventListener('focus', () => {
      const suggestion = inferFieldValue(element, payment);
      if (suggestion) {
        // Small delay to avoid flicker
        setTimeout(() => {
          showContextMenu(element, suggestion);
        }, 200);
      }
    });
  });

  logger.info('Smart autofill initialized', { inputCount: inputs.length });
}

