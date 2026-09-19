import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Widget } from './Widget';

afterEach(cleanup);

function renderWidget(ui: React.ReactNode): void {
  render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Widget', () => {
  it('opens its module off the title row', () => {
    renderWidget(
      <Widget title="Water" caption="no heater · ATO on" to="/water">
        rows
      </Widget>
    );

    expect(screen.getByRole('link', { name: 'Water module' }).getAttribute('href')).toBe('/water');
    expect(screen.getByText('no heater · ATO on')).toBeTruthy();
  });

  it('has no link to offer when it is not a window onto anything', () => {
    renderWidget(<Widget title="Needs you">nothing</Widget>);

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('pins the verbs under a hairline, below the body', () => {
    renderWidget(
      <Widget title="Nutrients" footer={<button type="button">Dose</button>}>
        rows
      </Widget>
    );

    const footer = screen.getByRole('button', { name: 'Dose' }).parentElement!;
    expect(footer.className).toContain('border-t');
  });
});
