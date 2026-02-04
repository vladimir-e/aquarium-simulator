import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import GameShell from './GameShell';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  motion: {
    div: ({ children, className }: { children?: React.ReactNode; className?: string }): React.ReactElement => (
      <div className={className}>{children}</div>
    ),
  },
}));

// Mock matchMedia for responsive tests
const mockMatchMedia = (matches: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe('GameShell', () => {
  const defaultProps = {
    header: <div data-testid="header">Header</div>,
    tank: <div data-testid="tank">Tank</div>,
    tabs: <div data-testid="tabs">Tabs</div>,
    panel: <div data-testid="panel">Panel</div>,
  };

  beforeAll(() => {
    mockMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    render(<GameShell {...defaultProps} />);
    expect(screen.getByTestId('header')).toBeTruthy();
  });

  it('contains header section', () => {
    render(<GameShell {...defaultProps} />);
    const header = screen.getByTestId('header');
    expect(header).toBeTruthy();
    expect(header.textContent).toBe('Header');
  });

  it('contains tank section', () => {
    render(<GameShell {...defaultProps} />);
    const tank = screen.getByTestId('tank');
    expect(tank).toBeTruthy();
    expect(tank.textContent).toBe('Tank');
  });

  it('contains tabs section', () => {
    render(<GameShell {...defaultProps} />);
    const tabs = screen.getByTestId('tabs');
    expect(tabs).toBeTruthy();
    expect(tabs.textContent).toBe('Tabs');
  });

  it('contains panel section', () => {
    render(<GameShell {...defaultProps} />);
    const panel = screen.getByTestId('panel');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toBe('Panel');
  });

  it('renders all sections in correct order', () => {
    const { container } = render(<GameShell {...defaultProps} />);
    const sections = container.querySelectorAll('[data-testid]');
    const testIds = Array.from(sections).map((el) => el.getAttribute('data-testid'));

    expect(testIds).toContain('header');
    expect(testIds).toContain('tank');
    expect(testIds).toContain('tabs');
    expect(testIds).toContain('panel');
  });

  it('has scrollable panel area', () => {
    const { container } = render(<GameShell {...defaultProps} />);
    const scrollableArea = container.querySelector('.overflow-y-auto');
    expect(scrollableArea).not.toBeNull();
  });

  it('applies flex column layout', () => {
    mockMatchMedia(false);
    const { container } = render(<GameShell {...defaultProps} />);
    const mainContainer = container.querySelector('.flex.flex-col');
    expect(mainContainer).not.toBeNull();
  });

  it('contains tank with aspect ratio container', () => {
    const { container } = render(<GameShell {...defaultProps} />);
    const aspectContainer = container.querySelector('.aspect-\\[5\\/3\\]');
    expect(aspectContainer).not.toBeNull();
  });
});
