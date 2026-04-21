/**
 * Duration parser for the calibration CLI.
 *
 * Accepted forms:
 * - `5d`  → 5 * 24 = 120 ticks
 * - `48h` → 48 ticks
 * - `1`   → 1 tick (bare integer = hours)
 */

const PATTERN = /^(\d+)(d|h)?$/i;

export function parseDuration(input: string): number {
  const trimmed = input.trim();
  const match = trimmed.match(PATTERN);
  if (!match) {
    throw new Error(
      `Invalid duration "${input}". Expected forms like "5d", "48h", or "1".`
    );
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid duration "${input}": must be a non-negative integer.`);
  }
  const unit = (match[2] ?? 'h').toLowerCase();
  return unit === 'd' ? value * 24 : value;
}

export function formatDuration(ticks: number): string {
  if (ticks % 24 === 0 && ticks !== 0) return `${ticks / 24}d`;
  return `${ticks}h`;
}
