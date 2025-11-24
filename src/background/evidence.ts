import { evidenceService } from '../shared/apiClient';
import { telemetry } from './telemetry';
import { logger } from '../shared/logger';
import { config } from '../shared/config';

class EvidenceService {
  async captureAndUpload(paymentId: string, metadata: unknown): Promise<void> {
    try {
      if (config.useTestData) {
        // TODO: Remove test data mock when real evidence upload is available
        logger.info('Using test data for evidence capture and upload', { paymentId });
        // Simulate screenshot capture delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // In test mode, skip actual screenshot capture and GCS upload
        // Just simulate the upload process
        const presignedResponse = await evidenceService.getPresignedUrl(
          paymentId,
          `screenshot_${Date.now()}.png`
        );

        logger.info('Evidence upload simulated (test mode)', {
          paymentId,
          screenshotUrl: presignedResponse.url,
        });

        // Upload metadata
        await evidenceService.uploadMetadata(paymentId, {
          screenshotUrl: presignedResponse.url.split('?')[0],
          metadata,
          uploadedAt: new Date().toISOString(),
        });

        await telemetry.logEvent({
          eventType: 'evidence_uploaded',
          timestamp: new Date().toISOString(),
          paymentId,
        });

        logger.info('Evidence uploaded successfully (test mode)', { paymentId });
        return;
      }

      // TODO: Replace with actual screenshot capture and GCS upload
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

      // Get pre-signed URL
      const presignedResponse = await evidenceService.getPresignedUrl(
        paymentId,
        `screenshot_${Date.now()}.png`
      );

      if (!presignedResponse?.url) {
        throw new Error('Failed to get pre-signed URL');
      }

      // Upload to GCS
      const uploadResponse = await fetch(presignedResponse.url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'image/png',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      // Upload metadata
      await evidenceService.uploadMetadata(paymentId, {
        screenshotUrl: presignedResponse.url.split('?')[0], // Remove query params
        metadata,
        uploadedAt: new Date().toISOString(),
      });

      await telemetry.logEvent({
        eventType: 'evidence_uploaded',
        timestamp: new Date().toISOString(),
        paymentId,
      });

      logger.info('Evidence uploaded successfully', { paymentId });
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
}

export const evidence = new EvidenceService();

