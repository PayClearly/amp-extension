import { z } from 'zod';

export const PaymentSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  clientId: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  amount: z.number(),
  currency: z.string(),
  invoiceNumbers: z.array(z.string()),
  portalId: z.string().nullable(),
  portalUrl: z.string().nullable(),
  virtualCard: z.object({
    cardNumber: z.string(),
    expiry: z.string(),
    cvv: z.string(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
  }),
  metadata: z.record(z.unknown()),
});

export const FieldMappingSchema = z.object({
  selector: z.string(),
  semanticType: z.enum([
    'amount',
    'invoice_number',
    'account_number',
    'routing_number',
    'card_number',
    'expiry',
    'cvv',
    'email',
    'phone',
    'date',
    'text',
  ]),
  inputType: z.string(),
  label: z.string().optional(),
  confidence: z.number(),
});

export const PortalTemplateSchema = z.object({
  id: z.string(),
  portalId: z.string(),
  accountId: z.string(),
  clientId: z.string(),
  vendorId: z.string(),
  pageKey: z.string(),
  fields: z.array(FieldMappingSchema),
  confidence: z.number(),
  version: z.number(),
  signature: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ExtensionNotificationSchema = z.object({
  type: z.enum([
    'NEXT_STEP_REQUIRED',
    'AUTO_ACTION_IN_PROGRESS',
    'AUTO_ACTION_COMPLETE',
    'WARNING',
    'ERROR',
  ]),
  messageKey: z.string(),
  humanMessage: z.string(),
  paymentId: z.string().optional(),
  portalId: z.string().optional(),
  pageKey: z.string().optional(),
  confidence: z.number().optional(),
  blocking: z.boolean().optional(),
  timestamp: z.string(),
});

export const PortalDetectionResultSchema = z.object({
  portalId: z.string(),
  confidence: z.number(),
  pageKey: z.string(),
  url: z.string(),
  fingerprint: z.string(),
});

export const ConfirmationMetadataSchema = z.object({
  confirmationNumber: z.string().nullable(),
  invoiceNumbers: z.array(z.string()),
  amount: z.number().nullable(),
  timestamp: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  transactionId: z.string().nullable(),
});

export const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  operator_id: z.string().optional(),
});

