import React from 'react';
import type { Payment } from '../../shared/types';

interface PaymentSummaryProps {
  payment: Payment | null;
}

export function PaymentSummary({ payment }: PaymentSummaryProps): JSX.Element {
  if (!payment) {
    return (
      <div className="payment-summary">
        <p className="empty-state">No active payment</p>
      </div>
    );
  }

  const formatCurrency = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  return (
    <div className="payment-summary">
      <h2>Current Payment</h2>
      <div className="payment-details">
        <div className="detail-row">
          <span className="label">Vendor:</span>
          <span className="value">{payment.vendorName}</span>
        </div>
        <div className="detail-row">
          <span className="label">Amount:</span>
          <span className="value">{formatCurrency(payment.amount, payment.currency)}</span>
        </div>
        <div className="detail-row">
          <span className="label">Invoices:</span>
          <span className="value">{payment.invoiceNumbers.join(', ')}</span>
        </div>
        {payment.portalUrl && (
          <div className="detail-row">
            <a
              href={payment.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-link"
            >
              Open Portal
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

