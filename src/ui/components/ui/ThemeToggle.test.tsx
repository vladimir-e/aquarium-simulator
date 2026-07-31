import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { ThemeProvider } from '../../hooks/useTheme';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

function toggle(): HTMLElement {
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
  return screen.getByRole('button');
}

/** The mode the button is in, read off the label it offers. */
function mode(button: HTMLElement): string {
  return (button.getAttribute('aria-label') ?? '').split(' ')[0];
}

describe('ThemeToggle', () => {
  it('opens on whatever mode is stored, OS-follow by default', () => {
    expect(mode(toggle())).toBe('System');
    cleanup();

    globalThis.localStorage.setItem('aquarium-theme-mode', 'dark');
    expect(mode(toggle())).toBe('Dark');
  });

  it('cycles back to OS-follow rather than stranding the reader on a fixed theme', () => {
    const button = toggle();

    expect(mode(button)).toBe('System');
    fireEvent.click(button);
    expect(mode(button)).toBe('Light');
    fireEvent.click(button);
    expect(mode(button)).toBe('Dark');
    // The step that the light/dark switch could not take.
    fireEvent.click(button);
    expect(mode(button)).toBe('System');
    expect(globalThis.localStorage.getItem('aquarium-theme-mode')).toBe('system');
  });

  it('names the mode it is in and the one it would go to', () => {
    const button = toggle();
    expect(button.getAttribute('aria-label')).toBe('System theme — switch to light');
    expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'));
  });
});
