import { evidenceService } from '../shared/apiClient';
import { telemetry } from './telemetry';
import { logger } from '../shared/logger';
import { config } from '../shared/config';
import { retryWithBackoff } from '../shared/retry';
import { md5Hash } from '../shared/crypto';
import type { Payment } from '../shared/types';

class EvidenceService {
  async captureAndUpload(
    paymentId: string,
    metadata: unknown,
    payment?: Payment
  ): Promise<void> {
    try {
      if (!payment) {
        throw new Error('Payment data required for evidence upload');
      }

      const accountId = payment.accountId;
      // OrganizationId might be in metadata or derived from account/client
      // For now, we'll use accountId as fallback if organizationId is not available
      const organizationId = (payment.metadata?.organizationId as string) || accountId;

      // Generate filename with timestamp
      const originalFilename = `screenshot_${Date.now()}.png`;

      // Hash the filename using MD5
      const hashedFilename = md5Hash(originalFilename);

      // Construct GCS path: bucket/{organizationId}/{accountId}/{paymentId}/sent/{hashedFilename}
      const gcsPath = `${organizationId}/${accountId}/${paymentId}/sent/${hashedFilename}`;

      if (config.useTestData) {
        // TODO: Remove test data mock when real evidence upload is available
        logger.info('Using test data for evidence capture and upload', {
          paymentId,
          accountId,
          organizationId,
          gcsPath,
        });
        // Simulate screenshot capture delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // In test mode, skip actual screenshot capture and GCS upload
        // Just simulate the upload process
        const presignedResponse = await evidenceService.getPresignedUrl(
          paymentId,
          gcsPath,
          hashedFilename
        );

        logger.info('Evidence upload simulated (test mode)', {
          paymentId,
          gcsPath,
          screenshotUrl: presignedResponse.url,
        });

        // Upload metadata
        await evidenceService.uploadMetadata(paymentId, {
          screenshotUrl: presignedResponse.url.split('?')[0],
          gcsPath,
          metadata,
          uploadedAt: new Date().toISOString(),
        });

        await telemetry.logEvent({
          eventType: 'evidence_uploaded',
          timestamp: new Date().toISOString(),
          paymentId,
        });

        logger.info('Evidence uploaded successfully (test mode)', { paymentId, gcsPath });
        return;
      }

      // Capture screenshot
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('No active tab found');
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tabs[0].windowId, {
        format: 'png',
        quality: 100,
      });

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Get pre-signed URL with correct GCS path
      const presignedResponse = await evidenceService.getPresignedUrl(
        paymentId,
        gcsPath,
        hashedFilename
      );

      if (!presignedResponse?.url) {
        throw new Error('Failed to get pre-signed URL');
      }

      // Upload to GCS with retry logic
      const uploadResponse = await this.uploadWithRetry(
        presignedResponse.url,
        blob,
        3 // 3 retries
      );

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      // Upload metadata
      await evidenceService.uploadMetadata(paymentId, {
        screenshotUrl: presignedResponse.url.split('?')[0], // Remove query params
        gcsPath,
        metadata,
        uploadedAt: new Date().toISOString(),
      });

      await telemetry.logEvent({
        eventType: 'evidence_uploaded',
        timestamp: new Date().toISOString(),
        paymentId,
        metadata: { gcsPath, hashedFilename },
      });

      logger.info('Evidence uploaded successfully', { paymentId, gcsPath, hashedFilename });
    } catch (error) {
      logger.error('Failed to upload evidence', error);
      await telemetry.logEvent({
        eventType: 'evidence_upload_failed',
        timestamp: new Date().toISOString(),
        paymentId,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  /**
   * Upload blob to GCS with retry logic
   */
  private async uploadWithRetry(
    url: string,
    blob: Blob,
    maxRetries: number
  ): Promise<Response> {
    return retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          method: 'PUT',
          body: blob,
          headers: {
            'Content-Type': 'image/png',
          },
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        return response;
      },
      {
        maxRetries,
        initialDelay: 1000,
        maxDelay: 10000,
      }
    );
  }
}

export const evidence = new EvidenceService();

