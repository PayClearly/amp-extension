import React, { useState } from 'react';
import type { ExtensionState, Payment } from '../../shared/types';

interface ControlsProps {
  state: ExtensionState;
  payment: Payment | null;
}

export function Controls({ state, payment }: ControlsProps): JSX.Element {
  const [stopAfterNext, setStopAfterNext] = useState(false);

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

  const isBlocked = state === 'FETCHING' || state === 'COMPLETING';

  return (
    <div className="controls">
      <button
        onClick={handleGetNextPayment}
        disabled={isBlocked || state !== 'IDLE'}
        className="btn btn-primary"
      >
        Get Next Payment
      </button>

      {state === 'ACTIVE' && (
        <button
          onClick={handleStopAfterNext}
          disabled={stopAfterNext}
          className="btn btn-secondary"
        >
          Stop After Next
        </button>
      )}

      {payment && (
        <button
          onClick={handleCreateException}
          disabled={isBlocked}
          className="btn btn-danger"
        >
          Create Exception
        </button>
      )}
    </div>
  );
}

