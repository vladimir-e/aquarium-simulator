/**
 * happy-dom runs no layout engine, so a height contract can only be checked
 * where it is written: the utilities that declare it. These read the main-axis
 * pins off a class list, which is enough to hold a column to its budget —
 * what each band is floored at, and whether it can give height back.
 */

function classList(el: HTMLElement): string {
  return el.getAttribute('class') ?? '';
}

/** The px value a `min-h-[Npx]`-style utility pins, or null when unpinned. */
export function pinnedPx(el: HTMLElement, utility: 'h' | 'min-h' | 'basis'): number | null {
  const match = new RegExp(`(?:^|\\s)${utility}-\\[(\\d+(?:\\.\\d+)?)px\\]`).exec(classList(el));
  return match ? Number(match[1]) : null;
}

/** Whether the element holds a height it cannot yield when the column is short. */
export function isRigid(el: HTMLElement): boolean {
  return pinnedPx(el, 'h') !== null || /(?:^|\s)shrink-0(?:\s|$)/.test(classList(el));
}

/** The bands sharing a flex column's height, in order. */
export function bandsOf(column: HTMLElement): HTMLElement[] {
  return Array.from(column.children) as HTMLElement[];
}
