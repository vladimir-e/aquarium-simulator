import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CardHeader, CollapseRegion } from './Card';

afterEach(cleanup);

describe('CardHeader collapse', () => {
  it('renders a plain heading with no toggle when not collapsible', () => {
    render(<CardHeader title="Livestock" />);
    expect(screen.getByRole('heading', { name: 'Livestock' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('exposes an expanded toggle that fires onToggle', () => {
    const onToggle = vi.fn();
    render(<CardHeader title="Livestock" collapsible collapsed={false} onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: /Livestock/ });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reports the collapsed state through aria-expanded=false', () => {
    render(<CardHeader title="Systems" collapsible collapsed onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /Systems/ }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('CollapseRegion', () => {
  it('keeps children flat (display:contents) when expanded', () => {
    const { container } = render(
      <CollapseRegion collapsed={false}>
        <span>body</span>
      </CollapseRegion>
    );
    expect(container.firstElementChild?.className).toContain('contents');
    expect(container.firstElementChild?.className).not.toContain('max-sm:hidden');
  });

  it('hides children below sm when collapsed', () => {
    const { container } = render(
      <CollapseRegion collapsed>
        <span>body</span>
      </CollapseRegion>
    );
    expect(container.firstElementChild?.className).toContain('max-sm:hidden');
  });
});
