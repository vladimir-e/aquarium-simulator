/** The six sections, in rail order. Water is home, so it owns the root. */

export type SectionId = 'water' | 'equipment' | 'flora' | 'livestock' | 'analytics' | 'scenario';

export interface SectionDef {
  id: SectionId;
  path: string;
  label: string;
}

export const SECTIONS: readonly SectionDef[] = [
  { id: 'water', path: '/', label: 'Water' },
  { id: 'equipment', path: '/equipment', label: 'Equipment' },
  { id: 'flora', path: '/flora', label: 'Flora & Scape' },
  { id: 'livestock', path: '/livestock', label: 'Livestock' },
  { id: 'analytics', path: '/analytics', label: 'Analytics' },
  { id: 'scenario', path: '/scenario', label: 'Scenario' },
];
