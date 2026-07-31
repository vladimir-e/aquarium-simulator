import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Stage } from './Stage';

afterEach(cleanup);

describe('Stage', () => {
  it('titles the section as the page heading', () => {
    render(<Stage title="Livestock">roster</Stage>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Livestock');
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('renders the meta and the section-owned controls beside the title', () => {
    render(
      <Stage title="Flora & Scape" meta="plants · algae" actions={<button type="button">Add plant</button>}>
        content
      </Stage>
    );
    expect(screen.getByText('plants · algae')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add plant' })).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('leaves no empty slots in the header when a section has neither meta nor controls', () => {
    render(<Stage title="Water">gauges</Stage>);
    const header = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(header?.children).toHaveLength(1);
  });
});
