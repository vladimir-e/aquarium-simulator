import React from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { VerbId } from '../../actions';
import type { Need } from '../../nav';
import type { ReadingBook } from '../../readings';
import { CONTROL_FOCUS } from '../ui/focus';

const VERB_LINK =
  `flex shrink-0 items-center gap-0.5 rounded-control px-1 text-[13px] font-medium text-accent transition-colors hover:bg-surface-2 ${CONTROL_FOCUS}`;

/**
 * What needs the keeper, one line each, worst first — and beside every line the
 * verb that answers it. Rendered only when the engine has latched something, so
 * a quiet tank is a quiet screen and the grid moves up to fill the space.
 */
export function NeedsStrip({
  needs,
  book,
  onAct,
}: {
  needs: Need[];
  book: ReadingBook;
  onAct: (verb: VerbId) => void;
}): React.JSX.Element | null {
  if (needs.length === 0) return null;

  return (
    <section
      aria-label="Needs you"
      className="shrink-0 rounded-card border border-hairline bg-surface px-3"
    >
      {needs.map((need) => {
        const reading = book.byId[need.reading];
        const { act } = need;
        return (
          <div
            key={need.id}
            className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline py-2 first:border-t-0"
          >
            <span
              className={`flex shrink-0 items-center gap-1.5 text-[13px] font-medium ${
                need.tone === 'alert' ? 'text-alert' : 'text-warn'
              }`}
            >
              <TriangleAlert className="h-3.5 w-3.5" />
              {need.text}
            </span>
            <p className="min-w-0 flex-1 text-[13px] text-ink-2">
              <span className="font-medium tabular-nums text-ink">
                {reading.value} {reading.unit}
              </span>{' '}
              — {reading.sentence}
            </p>
            {act ? (
              <button type="button" onClick={() => onAct(act)} className={VERB_LINK}>
                {need.verb}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Link to={need.to} className={VERB_LINK}>
                {need.verb}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
