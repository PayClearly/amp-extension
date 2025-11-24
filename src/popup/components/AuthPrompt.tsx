import React, { useState } from 'react';

interface AuthPromptProps {
  onAuthSuccess?: () => void;
}

export function AuthPrompt({ onAuthSuccess }: AuthPromptProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await new Promise<{ success: boolean; authenticated?: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage({ type: 'AUTH_REQUIRED' }, resolve);
        }
      );

      if (response.success && response.authenticated) {
        onAuthSuccess?.();
      } else {
        setError(response.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-prompt">
      <h2>Authentication Required</h2>
      <p>Please sign in to continue using the PayClearly Payment Accelerator.</p>
      {error && <div className="error-message">{error}</div>}
      <button onClick={handleSignIn} disabled={isLoading} className="btn btn-primary">
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </div>
  );
}

