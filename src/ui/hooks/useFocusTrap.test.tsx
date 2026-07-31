import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

afterEach(cleanup);

/** The panel stays mounted while `active` flips, so a leaked listener shows. */
function Trapped({ active }: { active: boolean }): React.JSX.Element {
  const ref = useFocusTrap(active);
  return (
    <>
      <button type="button">outside</button>
      <div ref={ref}>
        <button type="button">first</button>
        <button type="button">last</button>
      </div>
    </>
  );
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('useFocusTrap', () => {
  it('pulls focus back in when Tab arrives with nothing inside focused', () => {
    render(<Trapped active />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).not.toBe(button('first'));

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(button('first'));
  });

  it('lets Tab go once it is closed', () => {
    const { rerender } = render(<Trapped active />);
    rerender(<Trapped active={false} />);

    button('outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(button('outside'));
  });
});
