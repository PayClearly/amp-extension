import React, { useState, useEffect } from 'react';
import type { ExtensionState, Payment } from '../../shared/types';

interface ControlsProps {
  state: ExtensionState;
  payment: Payment | null;
}

export function Controls({ state, payment }: ControlsProps): JSX.Element {
  const [stopAfterNext, setStopAfterNext] = useState(false);
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(true);

  useEffect(() => {
    // Load auto-fetch preference from storage
    chrome.storage.local.get('autoFetchEnabled', (result) => {
      if (result.autoFetchEnabled !== undefined) {
        setAutoFetchEnabled(result.autoFetchEnabled);
      }
    });
  }, []);

  const handleGetNextPayment = (): void => {
    chrome.runtime.sendMessage({ type: 'GET_NEXT_PAYMENT' });
  };

  const handleStopAfterNext = (): void => {
    setStopAfterNext(true);
    chrome.runtime.sendMessage({ type: 'STOP_AFTER_NEXT' });
  };

  const handleCreateException = (): void => {
    if (!payment) return;

    const reason = prompt('Reason for exception:');
    if (reason) {
      chrome.runtime.sendMessage({
        type: 'CREATE_EXCEPTION',
        paymentId: payment.id,
        reason,
      });
    }
  };

  const handleResetState = (): void => {
    if (confirm('Reset extension state to IDLE? This will clear the current payment.')) {
      chrome.runtime.sendMessage({ type: 'RESET_STATE' });
      setStopAfterNext(false);
    }
  };

  const handleTriggerAutofill = (): void => {
    chrome.runtime.sendMessage({ type: 'TRIGGER_AUTOFILL' });
  };

  const handleToggleAutoFetch = (): void => {
    const newValue = !autoFetchEnabled;
    setAutoFetchEnabled(newValue);
    chrome.storage.local.set({ autoFetchEnabled: newValue });
    chrome.runtime.sendMessage({ type: 'TOGGLE_AUTO_FETCH', enabled: newValue });
  };

  const isBlocked = state === 'FETCHING' || state === 'COMPLETING';

  return (
    <div className="controls">
      <div className="controls-row">
        <button
          onClick={handleGetNextPayment}
          disabled={isBlocked || state !== 'IDLE'}
          className="btn btn-primary"
          title="Fetch the next payment from the queue"
        >
          Get Next Payment
        </button>

        <button
          onClick={handleResetState}
          className="btn btn-secondary"
          title="Reset extension state to IDLE (for testing)"
        >
          Reset State
        </button>
      </div>

      {state === 'ACTIVE' && payment && (
        <div className="controls-row">
          <button
            onClick={handleTriggerAutofill}
            disabled={isBlocked}
            className="btn btn-primary"
            title="Manually trigger autofill on current page"
          >
            Test Autofill
          </button>

          <button
            onClick={handleStopAfterNext}
            disabled={stopAfterNext}
            className="btn btn-secondary"
          >
            Stop After Next
          </button>
        </div>
      )}

      {payment && (
        <div className="controls-row">
          <button
            onClick={handleCreateException}
            disabled={isBlocked}
            className="btn btn-danger"
          >
            Create Exception
          </button>
        </div>
      )}

      <div className="controls-row" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          <input
            type="checkbox"
            checked={autoFetchEnabled}
            onChange={handleToggleAutoFetch}
          />
          <span>Auto-fetch after completion</span>
        </label>
      </div>
    </div>
  );
}

