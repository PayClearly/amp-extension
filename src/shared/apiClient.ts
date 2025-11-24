import { config } from './config';
import { logger } from './logger';

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

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
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
  getNextPayment: async (timeout = 30000) => {
    const url = `${config.queueServiceUrl}/api/v1/queue/next-payment?timeout=${Math.min(timeout / 1000, 60)}`;
    return apiClient.get(url, { timeout });
  },
};

export const paymentService = {
  getPayment: async (paymentId: string) => {
    const url = `${config.paymentServiceUrl}/api/v1/payments/${paymentId}`;
    return apiClient.get(url);
  },
};

export const portalLearningService = {
  getTemplate: async (
    portalId: string,
    accountId: string,
    clientId: string,
    vendorId: string,
    pageKey = 'default'
  ) => {
    const url = `${config.portalLearningServiceUrl}/api/v1/portals/templates?portalId=${portalId}&accountId=${accountId}&clientId=${clientId}&vendorId=${vendorId}&pageKey=${pageKey}`;
    return apiClient.get(url);
  },
  createTemplate: async (template: unknown) => {
    const url = `${config.portalLearningServiceUrl}/api/v1/portals/templates`;
    return apiClient.post(url, template);
  },
  updateUsage: async (templateId: string, success: boolean, fieldsFilled: number, totalFields: number) => {
    const url = `${config.portalLearningServiceUrl}/api/v1/portals/templates/${templateId}/usage`;
    return apiClient.put(url, { success, fieldsFilled, totalFields });
  },
};

export const exceptionService = {
  createException: async (paymentId: string, reason: string) => {
    const url = `${config.exceptionServiceUrl}/api/v1/exceptions`;
    return apiClient.post(url, { paymentId, reason });
  },
};

export const evidenceService = {
  getPresignedUrl: async (paymentId: string, filename: string) => {
    const url = `${config.evidenceServiceUrl}/api/v1/evidence/presigned-url`;
    return apiClient.post(url, { paymentId, filename });
  },
  uploadMetadata: async (paymentId: string, metadata: unknown) => {
    const url = `${config.evidenceServiceUrl}/api/v1/evidence/${paymentId}/metadata`;
    return apiClient.post(url, metadata);
  },
};

export const telemetryService = {
  logEvent: async (event: unknown) => {
    if (!config.telemetryServiceUrl) {
      // If no telemetry service URL, skip (or use BigQuery directly)
      return;
    }
    const url = `${config.telemetryServiceUrl}/api/v1/telemetry/events`;
    return apiClient.post(url, { events: [event] });
  },
};

