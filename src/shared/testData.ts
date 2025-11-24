/**
 * Test data for development/testing when services are not available
 * Set USE_TEST_DATA=true in environment or config to enable
 */

import type { Payment, PortalTemplate } from './types';

export const MOCK_PAYMENT: Payment = {
  id: 'pay_test_123',
  accountId: 'acc_test_456',
  clientId: 'client_test_789',
  vendorId: 'vendor_test_abc',
  vendorName: 'Test Vendor Corp',
  amount: 1234.56,
  currency: 'USD',
  invoiceNumbers: ['INV-TEST-001', 'INV-TEST-002'],
  portalId: 'portal_test',
  portalUrl: 'https://example.com/payment',
  virtualCard: {
    cardNumber: '4111111111111111',
    expiry: '12/25',
    cvv: '123',
    accountNumber: '123456789',
    routingNumber: '987654321',
  },
  metadata: {
    priority: 'high',
    dueDate: '2024-12-31T00:00:00Z',
  },
};

export const MOCK_PAYMENT_RESPONSE = {
  payment: MOCK_PAYMENT,
  queuePosition: 1,
  estimatedWaitTime: 0,
};

export const MOCK_PORTAL_TEMPLATE: PortalTemplate = {
  id: 'template_test_123',
  portalId: 'portal_test',
  accountId: 'acc_test_456',
  clientId: 'client_test_789',
  vendorId: 'vendor_test_abc',
  pageKey: 'payment_form',
  fields: [
    {
      selector: '#amount-input',
      semanticType: 'amount',
      inputType: 'number',
      label: 'Payment Amount',
      confidence: 0.9,
    },
    {
      selector: '#invoice-input',
      semanticType: 'invoice_number',
      inputType: 'text',
      label: 'Invoice Number',
      confidence: 0.85,
    },
    {
      selector: '[name="cardNumber"]',
      semanticType: 'card_number',
      inputType: 'text',
      label: 'Card Number',
      confidence: 0.8,
    },
    {
      selector: '[name="expiry"]',
      semanticType: 'expiry',
      inputType: 'text',
      label: 'Expiry Date',
      confidence: 0.8,
    },
    {
      selector: '[name="cvv"]',
      semanticType: 'cvv',
      inputType: 'text',
      label: 'CVV',
      confidence: 0.8,
    },
  ],
  confidence: 0.87,
  version: 1,
  signature: 'mock_signature_for_testing',
  createdAt: '2024-01-10T12:00:00Z',
  updatedAt: '2024-01-10T12:00:00Z',
};

export const MOCK_TOKEN_RESPONSE = {
  access_token: 'mock_access_token_test_123',
  refresh_token: 'mock_refresh_token_test_123',
  expires_in: 3600,
  operator_id: 'op_test_123',
};

export const MOCK_PRESIGNED_URL_RESPONSE = {
  url: 'https://storage.googleapis.com/test-bucket/screenshots/pay_test_123/screenshot_1234567890.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=test',
  expiresAt: '2024-12-31T23:59:59Z',
};

export const MOCK_CONFIRMATION_METADATA = {
  confirmationNumber: 'CONF-TEST-123',
  invoiceNumbers: ['INV-TEST-001', 'INV-TEST-002'],
  amount: 1234.56,
  timestamp: '2024-01-15T14:30:00Z',
  paymentMethod: 'Virtual Card',
  transactionId: 'TXN-TEST-123',
};

// Simulate network delay for more realistic testing
export const MOCK_DELAY_MS = 500;

/**
 * Simulate network delay
 */
export function mockDelay(ms: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

