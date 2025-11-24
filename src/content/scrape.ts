import type { ConfirmationMetadata } from '../shared/types';
import { logger } from '../shared/logger';

export async function detectConfirmation(): Promise<boolean> {
  // TODO: Enhance confirmation detection with more sophisticated patterns
  // May need portal-specific confirmation detection based on learned templates

  // Check URL patterns
  if (window.location.href.match(/confirm|success|complete|thank.*you/i)) {
    return true;
  }

  // Check DOM markers
  const markers = [
    'confirmation',
    'success',
    'payment.*complete',
    'thank.*you',
    'transaction.*id',
    'reference.*number',
  ];

  const bodyText = document.body.textContent || '';
  if (markers.some((marker) => new RegExp(marker, 'i').test(bodyText))) {
    return true;
  }

  return false;
}

export async function scrapeConfirmationMetadata(): Promise<ConfirmationMetadata> {
  // TODO: Enhance metadata scraping with template-based selectors
  // Current implementation uses heuristics - should use learned template selectors when available

  const metadata: ConfirmationMetadata = {
    confirmationNumber: null,
    invoiceNumbers: [],
    amount: null,
    timestamp: null,
    paymentMethod: null,
    transactionId: null,
  };

  const bodyText = document.body.textContent || '';

  // Scrape confirmation number
  const confirmationPatterns = [
    /confirmation.*number[:\s]+([A-Z0-9-]+)/i,
    /reference.*number[:\s]+([A-Z0-9-]+)/i,
    /transaction.*id[:\s]+([A-Z0-9-]+)/i,
  ];

  for (const pattern of confirmationPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      metadata.confirmationNumber = match[1];
      break;
    }
  }

  // Scrape amount
  const amountPattern = /\$?([\d,]+\.\d{2})/g;
  const amounts = Array.from(bodyText.matchAll(amountPattern));
  if (amounts.length > 0) {
    const lastAmount = amounts[amounts.length - 1][1].replace(/,/g, '');
    metadata.amount = parseFloat(lastAmount);
  }

  // Scrape timestamp
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/;
  const dateMatch = bodyText.match(datePattern);
  if (dateMatch) {
    metadata.timestamp = dateMatch[1];
  }

  // Scrape invoice numbers
  const invoicePattern = /invoice.*number[:\s]+([A-Z0-9-]+)/gi;
  const invoiceMatches = Array.from(bodyText.matchAll(invoicePattern));
  metadata.invoiceNumbers = invoiceMatches.map((m) => m[1]);

  logger.info('Confirmation metadata scraped', {
    confirmationNumber: metadata.confirmationNumber,
    invoiceCount: metadata.invoiceNumbers.length,
    amount: metadata.amount,
  });

  return metadata;
}

