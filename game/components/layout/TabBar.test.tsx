import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TabBar from './TabBar';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children?: React.ReactNode; className?: string }): React.ReactElement => (
      <div className={className}>{children}</div>
    ),
  },
}));

describe('TabBar', () => {
  afterEach(() => {
    cleanup();
  });

  const TAB_LABELS = ['Tank', 'Equipment', 'Plants', 'Livestock', 'Actions', 'Logs'];

  it('renders all 6 tab pills', () => {
    render(<TabBar activeTab="tank" onTabChange={vi.fn()} />);

    TAB_LABELS.forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    });
  });

  it('renders tabs with correct role', () => {
    render(<TabBar activeTab="tank" onTabChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(6);
  });

  it('calls onTabChange when clicking a tab', () => {
    const onTabChange = vi.fn();
    render(<TabBar activeTab="tank" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Equipment' }));
    expect(onTabChange).toHaveBeenCalledWith('equipment');
  });

  it('marks active tab with aria-selected', () => {
    render(<TabBar activeTab="plants" onTabChange={vi.fn()} />);

    const plantsTab = screen.getByRole('tab', { name: 'Plants' });
    const tankTab = screen.getByRole('tab', { name: 'Tank' });

    expect(plantsTab.getAttribute('aria-selected')).toBe('true');
    expect(tankTab.getAttribute('aria-selected')).toBe('false');
  });

  it('active tab has tabIndex 0, others have -1', () => {
    render(<TabBar activeTab="equipment" onTabChange={vi.fn()} />);

    const equipmentTab = screen.getByRole('tab', { name: 'Equipment' });
    const tankTab = screen.getByRole('tab', { name: 'Tank' });

    expect(equipmentTab.getAttribute('tabindex')).toBe('0');
    expect(tankTab.getAttribute('tabindex')).toBe('-1');
  });

  it('has tablist role on container', () => {
    render(<TabBar activeTab="tank" onTabChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  it('tablist has aria-label', () => {
    render(<TabBar activeTab="tank" onTabChange={vi.fn()} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.getAttribute('aria-label')).toBe('Panel navigation');
  });

  describe('keyboard navigation', () => {
    it('navigates to next tab on ArrowRight', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="tank" onTabChange={onTabChange} />);

      const tankTab = screen.getByRole('tab', { name: 'Tank' });
      fireEvent.keyDown(tankTab, { key: 'ArrowRight' });

      expect(onTabChange).toHaveBeenCalledWith('equipment');
    });

    it('navigates to previous tab on ArrowLeft', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="equipment" onTabChange={onTabChange} />);

      const equipmentTab = screen.getByRole('tab', { name: 'Equipment' });
      fireEvent.keyDown(equipmentTab, { key: 'ArrowLeft' });

      expect(onTabChange).toHaveBeenCalledWith('tank');
    });

    it('wraps around to last tab when pressing ArrowLeft on first tab', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="tank" onTabChange={onTabChange} />);

      const tankTab = screen.getByRole('tab', { name: 'Tank' });
      fireEvent.keyDown(tankTab, { key: 'ArrowLeft' });

      expect(onTabChange).toHaveBeenCalledWith('logs');
    });

    it('wraps around to first tab when pressing ArrowRight on last tab', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="logs" onTabChange={onTabChange} />);

      const logsTab = screen.getByRole('tab', { name: 'Logs' });
      fireEvent.keyDown(logsTab, { key: 'ArrowRight' });

      expect(onTabChange).toHaveBeenCalledWith('tank');
    });

    it('navigates to first tab on Home key', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="plants" onTabChange={onTabChange} />);

      const plantsTab = screen.getByRole('tab', { name: 'Plants' });
      fireEvent.keyDown(plantsTab, { key: 'Home' });

      expect(onTabChange).toHaveBeenCalledWith('tank');
    });

    it('navigates to last tab on End key', () => {
      const onTabChange = vi.fn();
      render(<TabBar activeTab="plants" onTabChange={onTabChange} />);

      const plantsTab = screen.getByRole('tab', { name: 'Plants' });
      fireEvent.keyDown(plantsTab, { key: 'End' });

      expect(onTabChange).toHaveBeenCalledWith('logs');
    });
  });
});
