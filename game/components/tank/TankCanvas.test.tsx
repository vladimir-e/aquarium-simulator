import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Set up ResizeObserver mock before any imports that might need it
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Mock Pixi.js module completely
vi.mock('pixi.js', () => {
  return {
    Application: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      canvas: document.createElement('canvas'),
      stage: {
        addChild: vi.fn(),
        addChildAt: vi.fn(),
        getChildByLabel: vi.fn().mockReturnValue(null),
        removeChild: vi.fn(),
      },
      screen: { width: 800, height: 600 },
      resize: vi.fn(),
      destroy: vi.fn(),
    })),
    Graphics: vi.fn().mockImplementation(() => ({
      label: '',
      rect: vi.fn().mockReturnThis(),
      fill: vi.fn().mockReturnThis(),
    })),
    Container: vi.fn().mockImplementation(() => ({
      label: '',
      addChild: vi.fn(),
    })),
  };
});

import TankCanvas from './TankCanvas';

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

  it('has rounded border styling', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.className).toContain('rounded-xl');
  });

  it('has border styling', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.className).toContain('border-4');
  });

  it('fills container dimensions', () => {
    render(<TankCanvas />);
    const container = screen.getByRole('img');
    expect(container.className).toContain('h-full');
    expect(container.className).toContain('w-full');
  });
});
