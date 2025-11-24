import type { TelemetryEvent } from '../shared/types';
import { telemetryService } from '../shared/apiClient';
import { config } from '../shared/config';
import { logger } from '../shared/logger';

class TelemetryService {
  private eventBuffer: TelemetryEvent[] = [];
  private flushInterval: number | null = null;

  constructor() {
    // Flush buffer every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 30000) as unknown as number;
  }

  async logEvent(event: TelemetryEvent): Promise<void> {
    this.eventBuffer.push(event);

    // Flush if buffer is full (10 events)
    if (this.eventBuffer.length >= 10) {
      await this.flush();
    }

    // Also log to console in development
    logger.debug('Telemetry event', {
      eventType: event.eventType,
      timestamp: event.timestamp,
      operatorId: event.operatorId,
      paymentId: event.paymentId,
      portalId: event.portalId,
      pageKey: event.pageKey,
      metadata: event.metadata,
    });
  }

  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      if (config.telemetryServiceUrl) {
        await telemetryService.logEvent(events);
      } else {
        // TODO: Direct BigQuery insert if no HTTP service
        logger.warn('No telemetry service URL configured');
      }
    } catch (error) {
      logger.error('Failed to flush telemetry', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  destroy(): void {
    if (this.flushInterval !== null) {
      clearInterval(this.flushInterval);
    }
    // Flush remaining events
    this.flush();
  }
}

export const telemetry = new TelemetryService();

