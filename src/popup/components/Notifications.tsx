import React from 'react';
import type { ExtensionNotification } from '../../shared/types';

interface NotificationsProps {
  notifications: ExtensionNotification[];
}

export function Notifications({ notifications }: NotificationsProps): JSX.Element {
  if (notifications.length === 0) {
    return <div className="notifications"></div>;
  }

  const latest = notifications[notifications.length - 1];

  const getNotificationClass = (type: ExtensionNotification['type']): string => {
    switch (type) {
      case 'ERROR':
        return 'notification-error';
      case 'WARNING':
        return 'notification-warning';
      case 'AUTO_ACTION_IN_PROGRESS':
        return 'notification-info';
      case 'AUTO_ACTION_COMPLETE':
        return 'notification-success';
      case 'NEXT_STEP_REQUIRED':
        return 'notification-action';
      default:
        return 'notification-default';
    }
  };

  return (
    <div className="notifications">
      <div className={`notification ${getNotificationClass(latest.type)}`}>
        <div className="notification-message">{latest.humanMessage}</div>
        <div className="notification-timestamp">
          {new Date(latest.timestamp).toLocaleTimeString()}
        </div>
      </div>
      {notifications.length > 1 && (
        <div className="notification-history">
          <details>
            <summary>View History ({notifications.length - 1} more)</summary>
            <ul>
              {notifications.slice(0, -1).reverse().map((notif, idx) => (
                <li key={idx} className={getNotificationClass(notif.type)}>
                  {notif.humanMessage} ({new Date(notif.timestamp).toLocaleTimeString()})
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

