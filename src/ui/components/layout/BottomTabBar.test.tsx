import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BottomTabBar } from './BottomTabBar';

afterEach(cleanup);

describe('BottomTabBar', () => {
  it('renders the three modes and marks the active one', () => {
    render(<BottomTabBar mode="run" onModeChange={() => {}} />);
    for (const name of ['Build', 'Run', 'Review']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Run' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Build' }).getAttribute('aria-current')).toBeNull();
  });

  it('calls onModeChange with the tapped mode', () => {
    const onModeChange = vi.fn();
    render(<BottomTabBar mode="run" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onModeChange).toHaveBeenCalledWith('review');
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(onModeChange).toHaveBeenCalledWith('build');
  });
});
