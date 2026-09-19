import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Drawer, DRAWER_TOGGLE } from './Drawer';
import { FOCUSABLE } from '../../hooks/useFocusTrap';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  cleanup();
});

function Harness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} {...DRAWER_TOGGLE}>
        Act
      </button>
      <p>stage</p>
      <Drawer open={open} onClose={() => setOpen(false)} title="Act">
        <button type="button">Feed</button>
        <button type="button">Trim</button>
      </Drawer>
    </div>
  );
}

function open(): HTMLElement {
  const opener = screen.getByRole('button', { name: 'Act' });
  opener.focus();
  fireEvent.click(opener);
  return screen.getByRole('dialog', { name: 'Act' });
}

describe('Drawer', () => {
  it('lays over the stage rather than pushing it, and raises no scrim', () => {
    render(<Harness />);
    const drawer = open();

    expect(drawer.className).toContain('absolute');
    expect(drawer.getAttribute('aria-modal')).toBeNull();
    expect(screen.getByText('stage')).toBeTruthy();
  });

  it('closes on Escape, on the close button, and on a pointer outside it', () => {
    render(<Harness />);

    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close Act' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    fireEvent.pointerDown(screen.getByText('stage'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves the control that owns it free to close it itself', () => {
    render(<Harness />);
    open();

    const opener = screen.getByRole('button', { name: 'Act' });
    fireEvent.pointerDown(opener);
    fireEvent.click(opener);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('wraps Tab at both edges and hands focus back on close', () => {
    render(<Harness />);
    const drawer = open();
    const stops = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
    const [first, last] = [stops[0], stops[stops.length - 1]];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Act' }));
  });

  it('is a sheet from the bottom below the tablet breakpoint', () => {
    media.set(viewport(390));
    render(<Harness />);

    expect(open().className).toContain('fixed');
  });
});
