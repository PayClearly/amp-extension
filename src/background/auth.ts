import { config } from '../shared/config';
import { apiClient } from '../shared/apiClient';
import { logger } from '../shared/logger';
import { TokenResponseSchema } from '../shared/schemas';
import { telemetry } from './telemetry';
import { MOCK_TOKEN_RESPONSE } from '../shared/testData';

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;

  async authenticate(): Promise<void> {
    try {
      if (config.useTestData) {
        // TODO: Remove test data mock when real auth service is available
        logger.info('Using test data for authentication');
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay

        const data = TokenResponseSchema.parse(MOCK_TOKEN_RESPONSE);
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + data.expires_in * 1000;

        apiClient.setAccessToken(this.accessToken);

        await chrome.storage.local.set({
          refreshToken: this.refreshToken,
          tokenExpiry: this.tokenExpiry,
          operatorId: data.operator_id,
        });

        logger.info('Authentication successful (test mode)');

        // Telemetry
        await telemetry.logEvent({
          eventType: 'auth_success',
          timestamp: new Date().toISOString(),
          operatorId: data.operator_id,
        });
        return;
      }

      // TODO: Replace with actual Chrome identity API OAuth flow
      // Use Chrome identity API for OAuth
      const token = await chrome.identity.getAuthToken({
        interactive: true,
      });

      if (!token) {
        throw new Error('Failed to get auth token');
      }

      // TODO: Replace with actual auth service endpoint
      // Exchange Chrome token for backend token
      const response = await fetch(`${config.authServiceUrl}/api/v1/auth/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error(`Auth exchange failed: ${response.statusText}`);
      }

      const rawData = await response.json();
      const data = TokenResponseSchema.parse(rawData);

      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;

      apiClient.setAccessToken(this.accessToken);

      // Store refresh token securely (encrypted in chrome.storage.local)
      await chrome.storage.local.set({
        refreshToken: this.refreshToken,
        tokenExpiry: this.tokenExpiry,
        operatorId: data.operator_id,
      });

      logger.info('Authentication successful');

      // Telemetry
      await telemetry.logEvent({
        eventType: 'auth_success',
        timestamp: new Date().toISOString(),
        operatorId: data.operator_id,
      });
    } catch (error) {
      logger.error('Authentication failed', error);

      // Telemetry
      await telemetry.logEvent({
        eventType: 'auth_fail',
        timestamp: new Date().toISOString(),
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  async refreshTokenIfNeeded(): Promise<void> {
    if (!this.refreshToken) {
      // Try to load from storage
      const result = await chrome.storage.local.get(['refreshToken', 'tokenExpiry']);
      this.refreshToken = result.refreshToken || null;
      this.tokenExpiry = result.tokenExpiry || null;
    }

    if (!this.refreshToken) {
      logger.warn('No refresh token available');
      return;
    }

    // Refresh if token expires in less than 15 minutes
    if (this.tokenExpiry && Date.now() < this.tokenExpiry - 15 * 60 * 1000) {
      return; // Token still valid
    }

    try {
      if (config.useTestData) {
        // TODO: Remove test data mock when real auth service is available
        logger.info('Using test data for token refresh');
        await new Promise((resolve) => setTimeout(resolve, 300)); // Simulate network delay

        const data = TokenResponseSchema.parse(MOCK_TOKEN_RESPONSE);
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + data.expires_in * 1000;

        apiClient.setAccessToken(this.accessToken);

        await chrome.storage.local.set({
          refreshToken: this.refreshToken,
          tokenExpiry: this.tokenExpiry,
        });

        logger.info('Token refreshed successfully (test mode)');
        return;
      }

      // TODO: Replace with actual auth service refresh endpoint
      const response = await fetch(`${config.authServiceUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const rawData = await response.json();
      const data = TokenResponseSchema.parse(rawData);

      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;

      apiClient.setAccessToken(this.accessToken);

      await chrome.storage.local.set({
        refreshToken: this.refreshToken,
        tokenExpiry: this.tokenExpiry,
      });

      logger.info('Token refreshed successfully');
    } catch (error) {
      logger.error('Token refresh failed', error);
      // Clear tokens on failure
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiry = null;
      await chrome.storage.local.remove(['refreshToken', 'tokenExpiry']);
      throw error;
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async isAuthenticated(): Promise<boolean> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return true;
    }

    // Try to refresh
    try {
      await this.refreshTokenIfNeeded();
      return this.accessToken !== null;
    } catch {
      return false;
    }
  }
}

export const auth = new AuthService();

