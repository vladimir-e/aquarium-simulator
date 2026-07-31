/* eslint-disable no-undef */
// Browser globals (localStorage, location) are available in test environment
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';
import { handleResetQueryParam, STORAGE_KEY } from '../persistence/index.js';

const CRASHED_PATH = '/livestock';
const CRASHED_HREF = `http://localhost${CRASHED_PATH}`;

/** Sixty simulated days the user does not want to lose. */
const SAVED_TANK = JSON.stringify({ version: 99, simulation: { tick: 1440 } });

const realLocation = globalThis.location;
let location: { search: string; pathname: string; href: string };
let consoleError: MockInstance;

function setLocation(next: { search: string; pathname: string; href: string }): void {
  location = next;
  Object.defineProperty(globalThis, 'location', {
    value: location,
    writable: true,
    configurable: true,
  });
}

function Boom({ thrown }: { thrown?: unknown }): React.JSX.Element {
  throw thrown ?? new Error('tick exploded');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocation({ search: '', pathname: CRASHED_PATH, href: CRASHED_HREF });
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    consoleError.mockRestore();
    Object.defineProperty(globalThis, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    });
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>tank</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('tank')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the fallback with the error message instead of navigating away', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('tick exploded')).toBeTruthy();
    expect(location.href).toBe(CRASHED_HREF);
    expect(consoleError).toHaveBeenCalled();
  });

  it('leaves the saved tank in localStorage when it catches', () => {
    localStorage.setItem(STORAGE_KEY, SAVED_TANK);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(localStorage.getItem(STORAGE_KEY)).toBe(SAVED_TANK);
    expect(location.href).toBe(CRASHED_HREF);
  });

  it('retries the children in place, keeping the saved tank', () => {
    localStorage.setItem(STORAGE_KEY, SAVED_TANK);
    let throwing = true;

    function Flaky(): React.JSX.Element {
      if (throwing) throw new Error('transient');
      return <div>tank</div>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    throwing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('tank')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(SAVED_TANK);
    expect(location.href).toBe(CRASHED_HREF);
  });

  it('resets to a clean root URL that clears the tank on boot', () => {
    localStorage.setItem(STORAGE_KEY, SAVED_TANK);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset saved tank' }));

    // Reset is a navigation, not an in-place wipe: storage still holds the tank
    // until the reload runs the ?reset boot path.
    expect(location.href).toBe('/?reset');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(SAVED_TANK);

    setLocation({ search: '?reset', pathname: '/', href: '/?reset' });
    expect(handleResetQueryParam()).toBe(true);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    // Landing back on the route that crashed would re-crash immediately.
    expect(location.href).toBe('/');
  });

  it('renders the fallback for a throwable whose message getter throws', () => {
    localStorage.setItem(STORAGE_KEY, SAVED_TANK);
    const hostile = new Error('unused');
    Object.defineProperty(hostile, 'message', {
      get(): string {
        throw new Error('message getter exploded');
      },
    });

    render(
      <ErrorBoundary>
        <Boom thrown={hostile} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Unknown error')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(SAVED_TANK);
  });

  it('renders the fallback for a non-Error throwable', () => {
    render(
      <ErrorBoundary>
        <Boom thrown="plain string" />
      </ErrorBoundary>
    );

    expect(screen.getByText('plain string')).toBeTruthy();
  });
});
