import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ModulePage } from './ModulePage';

afterEach(cleanup);

describe('ModulePage', () => {
  it('titles the module as the page heading', () => {
    render(<ModulePage title="Gear">rack</ModulePage>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Gear');
  });

  it('renders the meta and the module-owned controls beside the title', () => {
    render(
      <ModulePage title="Water" meta="cycled · 28 d" actions={<button type="button">Add</button>}>
        rows
      </ModulePage>
    );
    expect(screen.getByText('cycled · 28 d')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('offers neither when a module brings neither', () => {
    render(<ModulePage title="Water">rows</ModulePage>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toBe('Water');
  });

  it('is a section, not a landmark — the stage owns the one main', () => {
    render(<ModulePage title="Water">rows</ModulePage>);
    expect(screen.queryByRole('main')).toBeNull();
  });
});
