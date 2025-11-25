import { config } from './config';
import { logger } from './logger';
import { retryWithBackoff } from './retry';
import type { Payment, PortalTemplate } from './types';
import {
  MOCK_PAYMENT_RESPONSE,
  MOCK_PORTAL_TEMPLATE,
  mockDelay,
} from './testData';

// API Response types
interface QueuePaymentResponse {
  payment: Payment;
  queuePosition?: number;
  estimatedWaitTime?: number;
}

interface PortalTemplateResponse {
  template: PortalTemplate;
}

interface PresignedUrlResponse {
  url: string;
  expiresAt?: string;
}

interface RequestOptions extends RequestInit {
  timeout?: number;
}

class ApiClient {
  private accessToken: string | null = null;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  private async request<T>(
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { timeout = 30000, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, clear it
          this.accessToken = null;
          throw new Error('Unauthorized: Token expired or invalid');
        }
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();

// Helper functions for specific endpoints
export const queueService = {
  getNextPayment: async (timeout = 30000): Promise<QueuePaymentResponse | null> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real queue service is available
      logger.info('Using test data for queue service');
      await mockDelay();
      return MOCK_PAYMENT_RESPONSE as QueuePaymentResponse;
    }

    // TODO: Replace with actual queue service endpoint
    // Real implementation: Long-poll queue service endpoint
    const url = `${config.queueServiceUrl}/api/v1/queue/next-payment?timeout=${Math.min(timeout / 1000, 60)}`;

    // Retry with exponential backoff: 3 retries, 1s/2s/4s delays with ±20% jitter
    return retryWithBackoff(
      () => apiClient.get<QueuePaymentResponse>(url, { timeout }),
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 4000,
        jitter: 0.2,
      }
    );
  },
};

export const paymentService = {
  getPayment: async (paymentId: string): Promise<Payment> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real payment service is available
      logger.info('Using test data for payment service', { paymentId });
      await mockDelay();
      return MOCK_PAYMENT_RESPONSE.payment;
    }

    // TODO: Replace with actual payment service endpoint
    const url = `${config.paymentServiceUrl}/api/v1/payments/${paymentId}`;
    return apiClient.get<Payment>(url);
  },
};

export const portalLearningService = {
  getTemplate: async (
    portalId: string,
    accountId: string,
    clientId: string,
    vendorId: string,
    pageKey = 'default'
  ): Promise<PortalTemplateResponse | null> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real portal learning service is available
      logger.info('Using test data for portal learning service', { portalId, pageKey });
      await mockDelay();
      // Return template if it matches test data, otherwise return null (no template)
      if (
        portalId === MOCK_PORTAL_TEMPLATE.portalId &&
        accountId === MOCK_PORTAL_TEMPLATE.accountId &&
        clientId === MOCK_PORTAL_TEMPLATE.clientId &&
        vendorId === MOCK_PORTAL_TEMPLATE.vendorId &&
        pageKey === MOCK_PORTAL_TEMPLATE.pageKey
      ) {
        return { template: MOCK_PORTAL_TEMPLATE };
      }
      return null; // No template found (simulates learning mode)
    }

    // TODO: Replace with actual portal learning service endpoint
    const url = [
      `${config.portalLearningServiceUrl}/api/v1/portals/templates?`,
      `portalId=${portalId}&`,
      `accountId=${accountId}&`,
      `clientId=${clientId}&`,
      `vendorId=${vendorId}&`,
      `pageKey=${pageKey}`
    ].join('');
    return apiClient.get<PortalTemplateResponse | null>(url);
  },
  createTemplate: async (template: unknown): Promise<PortalTemplateResponse> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real portal learning service is available
      logger.info('Using test data for template creation');
      await mockDelay();
      return { template: { ...MOCK_PORTAL_TEMPLATE, id: `template_${Date.now()}` } };
    }

    // TODO: Replace with actual portal learning service endpoint
    const url = `${config.portalLearningServiceUrl}/api/v1/portals/templates`;
    return apiClient.post<PortalTemplateResponse>(url, template);
  },
  updateUsage: async (
    templateId: string,
    success: boolean,
    fieldsFilled: number,
    totalFields: number
  ): Promise<{ success: boolean }> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real portal learning service is available
      logger.info('Using test data for template usage update', { templateId, success });
      await mockDelay();
      return { success: true };
    }

    // TODO: Replace with actual portal learning service endpoint
    const url = `${config.portalLearningServiceUrl}/api/v1/portals/templates/${templateId}/usage`;
    return apiClient.put<{ success: boolean }>(url, { success, fieldsFilled, totalFields });
  },
};

export const exceptionService = {
  createException: async (paymentId: string, reason: string) => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real exception service is available
      logger.info('Using test data for exception service', { paymentId, reason });
      await mockDelay();
      return { success: true, exceptionId: `exc_${Date.now()}` };
    }

    // TODO: Replace with actual exception service endpoint
    const url = `${config.exceptionServiceUrl}/api/v1/exceptions`;
    return apiClient.post<{ success: boolean; exceptionId?: string }>(url, {
      paymentId,
      reason,
    });
  },
};

export const evidenceService = {
  getPresignedUrl: async (
    paymentId: string,
    gcsPath: string,
    hashedFilename: string
  ): Promise<PresignedUrlResponse> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real evidence service is available
      logger.info('Using test data for evidence service (presigned URL)', {
        paymentId,
        gcsPath,
        hashedFilename,
      });
      await mockDelay();
      // Return mock URL with correct bucket and path structure
      return {
        url: `https://storage.googleapis.com/${config.gcsBucket}/${gcsPath}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=test`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      };
    }

    // TODO: Replace with actual evidence service endpoint
    // Backend should generate presigned URL for: gs://payclearly-32f4e-storage-backup/{gcsPath}
    const url = `${config.evidenceServiceUrl}/api/v1/evidence/presigned-url`;
    return apiClient.post<PresignedUrlResponse>(url, {
      paymentId,
      gcsPath,
      hashedFilename,
      bucket: config.gcsBucket,
    });
  },
  uploadMetadata: async (paymentId: string, metadata: unknown): Promise<{ success: boolean; evidenceId?: string }> => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real evidence service is available
      logger.info('Using test data for evidence service (metadata upload)', { paymentId });
      await mockDelay();
      return { success: true, evidenceId: `evid_${Date.now()}` };
    }

    // TODO: Replace with actual evidence service endpoint
    const url = `${config.evidenceServiceUrl}/api/v1/evidence/${paymentId}/metadata`;
    return apiClient.post<{ success: boolean; evidenceId?: string }>(url, metadata);
  },
};

export const telemetryService = {
  logEvent: async (event: unknown) => {
    if (config.useTestData) {
      // TODO: Remove test data mock when real telemetry service is available
      // In test mode, just log to console
      logger.info('Telemetry event (test mode)', event as Record<string, unknown>);
      return;
    }

    if (!config.telemetryServiceUrl) {
      // TODO: Implement direct BigQuery insert if no HTTP service
      // If no telemetry service URL, skip (or use BigQuery directly)
      logger.warn('No telemetry service URL configured, event not sent');
      return;
    }

    // TODO: Replace with actual telemetry service endpoint or BigQuery direct insert
    const url = `${config.telemetryServiceUrl}/api/v1/telemetry/events`;
    return apiClient.post(url, { events: [event] });
  },
};

