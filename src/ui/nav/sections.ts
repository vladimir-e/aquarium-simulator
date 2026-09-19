/** The six rail items, in rail order. Overview is home, so it owns the root. */

export type SectionId = 'overview' | 'water' | 'life' | 'gear' | 'history' | 'setup';

export interface SectionDef {
  id: SectionId;
  path: string;
  label: string;
}

export const SECTIONS: readonly SectionDef[] = [
  { id: 'overview', path: '/', label: 'Overview' },
  { id: 'water', path: '/water', label: 'Water' },
  { id: 'life', path: '/life', label: 'Life' },
  { id: 'gear', path: '/gear', label: 'Gear' },
  { id: 'history', path: '/history', label: 'History' },
  { id: 'setup', path: '/setup', label: 'Setup' },
];

/** The rail is five tabs wide on a phone; the last two live behind More. */
export const TAB_IDS: readonly SectionId[] = ['overview', 'water', 'life', 'gear'];
export const MORE_IDS: readonly SectionId[] = ['history', 'setup'];
