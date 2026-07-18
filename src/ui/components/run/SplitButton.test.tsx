import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SplitButton, type SplitOption } from './SplitButton';

afterEach(cleanup);

function options(onA = vi.fn(), onB = vi.fn(), bDisabled = false): SplitOption[] {
  return [
    { key: 'a', label: 'Option A', onSelect: onA },
    { key: 'b', label: 'Option B', onSelect: onB, disabled: bDisabled },
  ];
}

describe('SplitButton — menu mode', () => {
  it('opens on click and runs the chosen option', () => {
    const onA = vi.fn();
    render(<SplitButton label="Pick" options={options(onA)} />);
    expect(screen.queryByText('Option A')).toBeNull();
    fireEvent.click(screen.getByText('Pick'));
    fireEvent.click(screen.getByText('Option A'));
    expect(onA).toHaveBeenCalledTimes(1);
    // menu closes after selecting
    expect(screen.queryByText('Option A')).toBeNull();
  });

  it('does not run a disabled option', () => {
    const onB = vi.fn();
    render(<SplitButton label="Pick" options={options(vi.fn(), onB, true)} />);
    fireEvent.click(screen.getByText('Pick'));
    fireEvent.click(screen.getByText('Option B'));
    expect(onB).not.toHaveBeenCalled();
  });

  it('closes on outside pointerdown and on Escape', () => {
    render(<SplitButton label="Pick" options={options()} />);
    fireEvent.click(screen.getByText('Pick'));
    expect(screen.getByText('Option A')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Option A')).toBeNull();

    fireEvent.click(screen.getByText('Pick'));
    expect(screen.getByText('Option A')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Option A')).toBeNull();
  });
});

describe('SplitButton — split mode', () => {
  it('runs the main action from the label and opens the menu from the caret', () => {
    const onMain = vi.fn();
    const onA = vi.fn();
    render(<SplitButton label="Feed" onMain={onMain} options={options(onA)} ariaLabel="Feed" />);
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(onMain).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Option A')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose amount' }));
    expect(screen.getByText('Option A')).toBeTruthy();
  });
});
