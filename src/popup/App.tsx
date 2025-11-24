import React, { useEffect, useState } from 'react';
import { Controls } from './components/Controls';
import { PaymentSummary } from './components/PaymentSummary';
import { Notifications } from './components/Notifications';
import { AuthPrompt } from './components/AuthPrompt';
import { useExtensionState } from './state/useExtensionState';

export function App(): JSX.Element {
  const { state, payment, notifications } = useExtensionState();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = checking

  useEffect(() => {
    // Check authentication status
    const checkAuth = (): void => {
      chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
        setIsAuthenticated(response?.authenticated || false);
      });
    };

    checkAuth();

    // Listen for auth state changes
    const messageListener = (
      message: { type: string; authenticated?: boolean },
      _sender: unknown,
      _sendResponse: unknown
    ): void => {
      if (message.type === 'AUTH_STATE_CHANGED' && message.authenticated !== undefined) {
        setIsAuthenticated(message.authenticated);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="app">
        <div className="auth-prompt">
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app">
        <AuthPrompt
          onAuthSuccess={() => {
            setIsAuthenticated(true);
          }}
        />
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

