import type { StateContext, Payment, PortalTemplate, ExtensionNotification } from '../shared/types';
import { auth } from './auth';
import { queueService, paymentService, portalLearningService, exceptionService } from '../shared/apiClient';
import { evidence } from './evidence';
import { telemetry } from './telemetry';
import { createNotification } from '../shared/events';
import { logger } from '../shared/logger';
import { PaymentSchema } from '../shared/schemas';
import { config } from '../shared/config';

class StateMachine {
  private context: StateContext = {
    state: 'IDLE',
    payment: null,
    portalId: null,
    pageKey: null,
    template: null,
    error: null,
    timestamps: {
      paymentReceivedAt: null,
      firstPortalInteractionAt: null,
      confirmationDetectedAt: null,
      paymentCompletedAt: null,
    },
  };

  private stopAfterNext = false;
  private autoFetchEnabled = true; // For testing: allow disabling auto-fetch

  async restore(): Promise<void> {
    const result = await chrome.storage.session.get('stateContext');
    if (result.stateContext) {
      this.context = result.stateContext as StateContext;
      logger.info('State restored', { state: this.context.state });
    }
  }

  private async persist(): Promise<void> {
    await chrome.storage.session.set({ stateContext: this.context });
  }

  private async transition(newState: StateContext['state']): Promise<void> {
    this.context.state = newState;
    await this.persist();
    this.broadcastStateChange();
  }

  private broadcastStateChange(): void {
    chrome.runtime.sendMessage({
      type: 'STATE_CHANGED',
      state: this.context.state,
    }).catch(() => {
      // Ignore errors (popup might not be open)
    });
  }

  private emitNotification(notification: ExtensionNotification): void {
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      notification,
    }).catch(() => {
      // Ignore errors
    });
  }

  async handleGetNextPayment(): Promise<void> {
    if (this.context.state !== 'IDLE') {
      logger.warn('Cannot get next payment: not in IDLE state', {
        currentState: this.context.state,
      });
      return;
    }

    await this.transition('FETCHING');
    this.emitNotification(createNotification('FETCHING_PAYMENT'));

    try {
      // Ensure authenticated
      if (!(await auth.isAuthenticated())) {
        await auth.authenticate();
      }

      // Fetch next payment with retry logic (handled in queueService)
      const response = await queueService.getNextPayment(30000);

      // Handle 204 No Content (no payment available)
      if (!response || !response.payment) {
        // No payment available (long-poll timeout)
        await this.transition('IDLE');
        this.emitNotification(
          createNotification('NO_PAYMENT_AVAILABLE')
        );
        return;
      }

      const payment = PaymentSchema.parse(response.payment) as Payment;
      this.context.payment = payment;
      this.context.timestamps.paymentReceivedAt = new Date().toISOString();

      // Fetch full payment details if needed
      if (!payment.portalId || !payment.portalUrl) {
        const fullPayment = await paymentService.getPayment(payment.id);
        this.context.payment = PaymentSchema.parse(fullPayment) as Payment;
      }

      await this.transition('ACTIVE');
      this.broadcastStateChange();

      // Telemetry
      await telemetry.logEvent({
        eventType: 'payment_fetched',
        timestamp: new Date().toISOString(),
        paymentId: payment.id,
        metadata: {
          queuePosition: response.queuePosition,
          estimatedWaitTime: response.estimatedWaitTime,
        },
      });

      logger.info('Payment fetched', { paymentId: payment.id });
    } catch (error) {
      logger.error('Failed to fetch payment', error);
      this.context.error = error instanceof Error ? error : new Error(String(error));
      await this.transition('IDLE');
      this.emitNotification(
        createNotification('PAYMENT_FETCH_FAILED', {
          paymentId: this.context.payment?.id,
        })
      );
    }
  }

  async handleStopAfterNext(): Promise<void> {
    this.stopAfterNext = true;
    logger.info('Stop after next payment enabled');
  }

  handleResetState(): void {
    this.context = {
      state: 'IDLE',
      payment: null,
      portalId: null,
      pageKey: null,
      template: null,
      error: null,
      timestamps: {
        paymentReceivedAt: null,
        firstPortalInteractionAt: null,
        confirmationDetectedAt: null,
        paymentCompletedAt: null,
      },
    };
    this.stopAfterNext = false;
    this.persist();
    this.broadcastStateChange();
    logger.info('State reset to IDLE');
  }

  setAutoFetchEnabled(enabled: boolean): void {
    this.autoFetchEnabled = enabled;
    logger.info('Auto-fetch enabled', { enabled });
  }

  async handleCreateException(paymentId: string, reason: string): Promise<void> {
    try {
      await exceptionService.createException(paymentId, reason);
      this.context.payment = null;
      await this.transition('IDLE');
      this.emitNotification(createNotification('EXCEPTION_CREATED'));

      await telemetry.logEvent({
        eventType: 'exception_created',
        timestamp: new Date().toISOString(),
        paymentId,
        metadata: { reason },
      });

      logger.info('Exception created', { paymentId, reason });
    } catch (error) {
      logger.error('Failed to create exception', error);
      this.emitNotification({
        type: 'ERROR',
        messageKey: 'EXCEPTION_CREATE_FAILED',
        humanMessage: 'Failed to create exception',
        timestamp: new Date().toISOString(),
        blocking: true,
      });
    }
  }

  async handlePortalDetected(
    portalId: string,
    confidence: number,
    pageKey: string
  ): Promise<void> {
    if (this.context.state !== 'ACTIVE') {
      return;
    }

    this.context.portalId = portalId;
    this.context.pageKey = pageKey;

    if (!this.context.timestamps.firstPortalInteractionAt) {
      this.context.timestamps.firstPortalInteractionAt = new Date().toISOString();
    }

    // Check for template
    if (this.context.payment) {
      try {
        const template = await portalLearningService.getTemplate(
          portalId,
          this.context.payment.accountId,
          this.context.payment.clientId,
          this.context.payment.vendorId,
          pageKey
        );

        // Handle both response formats: { template: {...} } or direct template object
        const portalTemplate = (template?.template || template) as PortalTemplate | null;

        if (portalTemplate) {

          // Check confidence threshold
          if (portalTemplate.confidence >= config.templateConfidenceThreshold) {
            this.context.template = portalTemplate;

            // Trigger autofill in content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'AUTOFILL',
                  template: portalTemplate,
                  payment: this.context.payment,
                }).catch((error) => {
                  logger.error('Failed to send autofill message to content script', error);
                });
              }
            });

            // Emit notification that autofill will happen
            this.emitNotification(
              createNotification('AUTOFILL_STARTING', {
                paymentId: this.context.payment?.id,
                portalId: portalId,
                pageKey: pageKey,
              })
            );
          } else {
            // Template exists but confidence too low
            await this.transition('TEMPLATE_MISMATCH');
            this.emitNotification(
              createNotification('TEMPLATE_LOW_CONFIDENCE', {
                paymentId: this.context.payment?.id,
                portalId: portalId,
                confidence: portalTemplate.confidence,
              })
            );
          }
        } else {
          // No template found - learning mode
          await this.transition('LEARNING');
          this.emitNotification(createNotification('LEARNING_MODE', {
            paymentId: this.context.payment?.id,
            portalId: portalId,
          }));

          // Notify content script to start learning mode
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'START_LEARNING',
              }).catch((error) => {
                logger.error('Failed to send learning mode message', error);
              });
            }
          });
        }
      } catch (error) {
        logger.error('Failed to get template', error);
      }
    }

    await telemetry.logEvent({
      eventType: 'portal_detected',
      timestamp: new Date().toISOString(),
      paymentId: this.context.payment?.id,
      portalId,
      pageKey,
      metadata: { confidence },
    });

    await this.persist();
  }

  async handleConfirmationDetected(metadata: unknown): Promise<void> {
    if (this.context.state !== 'ACTIVE' && this.context.state !== 'LEARNING') {
      return;
    }

    this.context.timestamps.confirmationDetectedAt = new Date().toISOString();
    await this.transition('COMPLETING');
    this.emitNotification(createNotification('CAPTURING_EVIDENCE'));

    try {
      // Capture payment ID before clearing state
      const paymentId = this.context.payment?.id;
      if (!paymentId) {
        throw new Error('No payment ID available');
      }

      // Capture screenshot and upload evidence
      await evidence.captureAndUpload(paymentId, metadata);

      this.context.timestamps.paymentCompletedAt = new Date().toISOString();

      // TODO: Call queue service to mark payment complete
      // Endpoint: PUT /api/v1/queue/payments/{paymentId}/complete
      // Should include evidence URL and metadata in request body

      // Clear state
      this.context.payment = null;
      this.context.portalId = null;
      this.context.pageKey = null;
      this.context.template = null;

      this.emitNotification(createNotification('PAYMENT_COMPLETED'));

      await telemetry.logEvent({
        eventType: 'payment_completed',
        timestamp: new Date().toISOString(),
        paymentId: paymentId,
        metadata: {
          timings: this.context.timestamps,
        },
      });

      // Get next payment if not stopping and auto-fetch is enabled
      if (!this.stopAfterNext && this.autoFetchEnabled) {
        await this.handleGetNextPayment();
      } else {
        this.stopAfterNext = false;
        await this.transition('IDLE');
      }
    } catch (error) {
      logger.error('Failed to complete payment', error);
      this.emitNotification(createNotification('EVIDENCE_UPLOAD_FAILED'));
      await this.transition('IDLE');
    }
  }
}

export const stateMachine = new StateMachine();

