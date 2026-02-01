import React, { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches render errors and shows emergency reset UI.
 * Provides a link to ?reset to clear all localStorage and recover.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const resetUrl = `${window.location.pathname}?reset`;

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
            backgroundColor: '#1a1a2e',
            color: '#eee',
          }}
        >
          <h1 style={{ fontSize: '24px', marginBottom: '16px', color: '#ff6b6b' }}>
            Something went wrong
          </h1>
          <p style={{ marginBottom: '24px', color: '#aaa', textAlign: 'center', maxWidth: '400px' }}>
            The application encountered an error. This might be caused by corrupted saved data.
          </p>
          <a
            href={resetUrl}
            style={{
              padding: '12px 24px',
              backgroundColor: '#4dabf7',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
            }}
          >
            Reset Application
          </a>
          <details
            style={{
              marginTop: '32px',
              padding: '16px',
              backgroundColor: '#252540',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '100%',
            }}
          >
            <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
              Error Details
            </summary>
            <pre
              style={{
                fontSize: '12px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
