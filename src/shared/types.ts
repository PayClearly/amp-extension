export interface Payment {
  id: string;
  accountId: string;
  clientId: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  currency: string;
  invoiceNumbers: string[];
  portalId: string | null;
  portalUrl: string | null;
  virtualCard: {
    cardNumber: string;
    expiry: string;
    cvv: string;
    accountNumber?: string;
    routingNumber?: string;
  };
  metadata: Record<string, unknown>;
  // Extended payment data structure
  paymentFields?: Record<string, string>;
  cards?: Array<{
    cardNumber: string;
    expirationMonth: string;
    expirationYear: string;
    cvv: string;
    type: string;
    amount: number;
    cardFee: number;
  }>;
  credentialFields?: Record<string, string>;
  accountMetadata?: {
    accountName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: {
      city?: string;
      stateProvince?: string;
      streetAddress?: string;
      zipCode?: string;
    };
  };
}

export interface PortalTemplate {
  id: string;
  portalId: string;
  accountId: string;
  clientId: string;
  vendorId: string;
  pageKey: string;
  fields: FieldMapping[];
  confidence: number;
  version: number;
  signature: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldMapping {
  selector: string;
  semanticType:
    | 'amount'
    | 'invoice_number'
    | 'account_number'
    | 'routing_number'
    | 'card_number'
    | 'expiry'
    | 'cvv'
    | 'email'
    | 'phone'
    | 'date'
    | 'text';
  inputType: string;
  label?: string;
  confidence: number;
}

export type NotificationType =
  | 'NEXT_STEP_REQUIRED'
  | 'AUTO_ACTION_IN_PROGRESS'
  | 'AUTO_ACTION_COMPLETE'
  | 'WARNING'
  | 'ERROR';

export interface ExtensionNotification {
  type: NotificationType;
  messageKey: string;
  humanMessage: string;
  paymentId?: string;
  portalId?: string;
  pageKey?: string;
  confidence?: number;
  blocking?: boolean;
  timestamp: string;
}

export type ExtensionState =
  | 'IDLE'
  | 'FETCHING'
  | 'ACTIVE'
  | 'COMPLETING'
  | 'LEARNING'
  | 'TEMPLATE_MISMATCH'
  | 'EXCEPTION'
  | 'BLOCKED_AUTOMATION';

export interface StateContext {
  state: ExtensionState;
  payment: Payment | null;
  portalId: string | null;
  pageKey: string | null;
  template: PortalTemplate | null;
  error: Error | null;
  timestamps: {
    paymentReceivedAt: string | null;
    firstPortalInteractionAt: string | null;
    confirmationDetectedAt: string | null;
    paymentCompletedAt: string | null;
  };
}

export interface PortalDetectionResult {
  portalId: string;
  confidence: number;
  pageKey: string;
  url: string;
  fingerprint: string;
}

export interface ConfirmationMetadata {
  confirmationNumber: string | null;
  invoiceNumbers: string[];
  amount: number | null;
  timestamp: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
}

export interface TelemetryEvent {
  eventType: string;
  timestamp: string;
  operatorId?: string;
  paymentId?: string;
  portalId?: string;
  pageKey?: string;
  metadata?: Record<string, unknown>;
}

