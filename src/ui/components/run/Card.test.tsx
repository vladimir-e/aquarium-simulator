import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CardHeader } from './Card';

afterEach(cleanup);

describe('CardHeader', () => {
  it('is a heading and nothing else', () => {
    render(<CardHeader title="Livestock" />);
    expect(screen.getByRole('heading', { name: 'Livestock' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sets the meta beside the title and the action apart from both', () => {
    render(<CardHeader title="Systems" meta="4 on" action={<button type="button">Add</button>} />);
    expect(screen.getByText('4 on')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});
