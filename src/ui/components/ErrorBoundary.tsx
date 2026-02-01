/**
 * Error boundary component for catching render errors.
 * When an error occurs, clears persisted state and reloads the page.
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called when an error is caught - typically clears persisted state */
  onError?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Application error:', error, errorInfo);

    // Clear persisted state and reload
    this.props.onError?.();
    window.location.href = window.location.pathname;
  }

  handleReset = (): void => {
    window.location.href = '?reset';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Show error UI with reset link
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            textAlign: 'center',
            backgroundColor: '#1a1a2e',
            color: '#eee',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ marginBottom: '1rem', color: '#aaa' }}>
            The application encountered an error. This may be due to corrupted saved data.
          </p>
          {this.state.error && (
            <pre
              style={{
                backgroundColor: '#2a2a3e',
                padding: '1rem',
                borderRadius: '4px',
                maxWidth: '600px',
                overflow: 'auto',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#ff6b6b',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '12px 24px',
              fontSize: '1rem',
              backgroundColor: '#4a9eff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reset Application
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#888' }}>
            Or visit{' '}
            <a href="?reset" style={{ color: '#4a9eff' }}>
              ?reset
            </a>{' '}
            directly
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
