import React, { useEffect, useState } from 'react';
import { Controls } from './components/Controls';
import { PaymentSummary } from './components/PaymentSummary';
import { Notifications } from './components/Notifications';
import { useExtensionState } from './state/useExtensionState';
import type { ExtensionNotification } from '../shared/types';

export function App(): JSX.Element {
  const { state, payment, notifications } = useExtensionState();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check authentication status
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
      setIsAuthenticated(response?.authenticated || false);
    });
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="auth-prompt">
          <h2>Authentication Required</h2>
          <button
            onClick={() => {
              chrome.runtime.sendMessage({ type: 'AUTH_REQUIRED' });
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>PayClearly</h1>
        <div className="state-badge">{state}</div>
      </header>

      <Notifications notifications={notifications} />

      <PaymentSummary payment={payment} />

      <Controls state={state} payment={payment} />
    </div>
  );
}

