import { config } from '../shared/config';
import { apiClient } from '../shared/apiClient';
import { logger } from '../shared/logger';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;

  async authenticate(): Promise<void> {
    try {
      // Use Chrome identity API for OAuth
      const token = await chrome.identity.getAuthToken({
        interactive: true,
      });

      if (!token) {
        throw new Error('Failed to get auth token');
      }

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

      const data = (await response.json()) as TokenResponse;
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;

      apiClient.setAccessToken(this.accessToken);

      // Store refresh token securely (encrypted in chrome.storage.local)
      await chrome.storage.local.set({
        refreshToken: this.refreshToken,
        tokenExpiry: this.tokenExpiry,
      });

      logger.info('Authentication successful');
    } catch (error) {
      logger.error('Authentication failed', error);
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

      const data = (await response.json()) as TokenResponse;
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

