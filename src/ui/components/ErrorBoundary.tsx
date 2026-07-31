/**
 * Error boundary for render errors. Shows a recovery screen and leaves the
 * saved tank alone — clearing it is the user's explicit choice, never a
 * side effect of catching.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  errorMessage: string | null;
}

const BUTTON_BASE =
  'rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function describeError(error: unknown): string {
  try {
    if (error instanceof Error && error.message) return error.message;
    const described = String(error);
    if (described) return described;
  } catch {
    // A hostile throwable (throwing getter, null-prototype object) must not
    // take the fallback down with it — the fallback has no boundary above it.
  }
  return 'Unknown error';
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { errorMessage: describeError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error('Application error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ errorMessage: null });
  };

  handleReset = (): void => {
    globalThis.location.href = '/?reset';
  };

  render(): ReactNode {
    const { errorMessage } = this.state;
    if (errorMessage === null) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-ink"
      >
        <h1 className="text-[17px] font-semibold">Something went wrong</h1>
        <p className="max-w-md text-[13px] text-ink-2">
          Your saved tank is untouched. Try again, or reload the page.
        </p>
        <pre className="max-w-full overflow-auto rounded-card border border-hairline bg-surface p-3 text-left font-mono text-[12px] text-alert-text">
          {errorMessage}
        </pre>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className={`${BUTTON_BASE} bg-accent text-surface hover:opacity-90`}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReset}
            className={`${BUTTON_BASE} border border-hairline bg-surface text-alert-text hover:border-hairline-2`}
          >
            Reset saved tank
          </button>
        </div>
        <p className="text-[12px] text-ink-3">Reset deletes the saved tank and starts over.</p>
      </div>
    );
  }
}
