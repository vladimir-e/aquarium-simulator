import React, { useState } from 'react';
import type { PickerKind } from '../../build';
import { DRAWER_TOGGLE } from '../ui/Drawer';
import { SpeciesGlyph } from '../ui/SpeciesGlyph';

const CHOICES: { kind: PickerKind; label: string; glyph: 'neon_tetra' | 'anubias' }[] = [
  { kind: 'fish', label: 'Add fish', glyph: 'neon_tetra' },
  { kind: 'plant', label: 'Add plant', glyph: 'anubias' },
];

/** The module's construction verbs, one button deep: a fish or a plant. */
export function AddMenu({ onPick }: { onPick: (kind: PickerKind) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as HTMLElement | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        {...DRAWER_TOGGLE}
        className="inline-flex h-7 shrink-0 items-center rounded-control border border-hairline px-2.5 text-[13px] text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        + Add
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-40 w-40 rounded-card border border-hairline bg-surface py-1 shadow-[var(--shadow-drawer)]">
          {CHOICES.map((choice) => (
            <button
              key={choice.kind}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(choice.kind);
              }}
              {...DRAWER_TOGGLE}
              className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <SpeciesGlyph species={choice.glyph} />
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
