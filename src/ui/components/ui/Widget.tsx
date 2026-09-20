import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface WidgetProps {
  title: string;
  /** What the widget has to say about itself in a glance — a tally, a status word. */
  caption?: string;
  /** The module this widget is a window onto. */
  to?: string;
  /** Contextual verbs, pinned under a hairline. */
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The one frame the whole dashboard is built from: a hairline on `surface`,
 * and nothing inside it bordered again. Title, body, and the verbs that move
 * whatever the body reads.
 */
export function Widget({
  title,
  caption,
  to,
  footer,
  className = '',
  children,
}: WidgetProps): React.JSX.Element {
  const head = (
    <>
      <h2 className="shrink-0 text-[14px] font-medium leading-5">{title}</h2>
      {caption && <p className="min-w-0 truncate text-[13px] text-ink-2">{caption}</p>}
      {to && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-3" />}
    </>
  );

  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-hairline bg-surface ${className}`}
    >
      {to ? (
        <Link
          to={to}
          aria-label={`${title} module`}
          className="flex items-baseline gap-2 px-3 pb-1.5 pt-2.5 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {head}
        </Link>
      ) : (
        <div className="flex items-baseline gap-2 px-3 pb-1.5 pt-2.5">{head}</div>
      )}

      <div className="min-h-0 flex-1 px-3">{children}</div>

      {footer && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline px-3 py-2">
          {footer}
        </div>
      )}
    </section>
  );
}
