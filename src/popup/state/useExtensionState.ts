import { useState, useEffect } from 'react';
import type { ExtensionState, Payment, ExtensionNotification } from '../../shared/types';

export function useExtensionState(): {
  state: ExtensionState;
  payment: Payment | null;
  notifications: ExtensionNotification[];
} {
  const [state, setState] = useState<ExtensionState>('IDLE');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [notifications, setNotifications] = useState<ExtensionNotification[]>([]);

  useEffect(() => {
    // Listen for state changes
    const messageListener = (
      message: { type: string; [key: string]: unknown },
      _sender: unknown,
      _sendResponse: unknown
    ) => {
      if (message.type === 'STATE_CHANGED') {
        setState(message.state as ExtensionState);
      } else if (message.type === 'NOTIFICATION') {
        setNotifications((prev) => [...prev, message.notification as ExtensionNotification]);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Load initial state
    chrome.storage.session.get('stateContext', (result) => {
      const stateContext = result.stateContext;
      if (stateContext) {
        setState(stateContext.state);
        setPayment(stateContext.payment || null);
      }
    });

    // Listen for storage changes
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'session' && changes.stateContext) {
        const stateContext = changes.stateContext.newValue;
        if (stateContext) {
          setState(stateContext.state);
          setPayment(stateContext.payment || null);
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  return { state, payment, notifications };
}

