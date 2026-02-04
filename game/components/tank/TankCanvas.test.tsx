import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TankCanvas from './TankCanvas';

// Pixi.js and ResizeObserver are mocked in game/test/setup.ts

describe('TankCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders container element', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img', { name: 'Aquarium tank visualization' });
    expect(container).toBeTruthy();
  });

  it('has correct aria attributes', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.getAttribute('aria-label')).toBe('Aquarium tank visualization');
  });

  it('shows loading state initially', () => {
    render(<TankCanvas />);
    expect(screen.getByText('Loading tank...')).toBeTruthy();
  });

  it('has glass-like shadow effect', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.className).toContain('shadow-');
  });

  it('has water background color', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.className).toContain('bg-[--color-water-deep]');
  });

  it('fills container dimensions', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.className).toContain('h-full');
    expect(container.className).toContain('w-full');
  });
});
