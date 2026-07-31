import React from 'react';

/** Peer card: flat surface, hairline border, header + body + optional footer. */
export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={`flex flex-col rounded-card border border-hairline bg-surface ${className}`}>
      {children}
    </section>
  );
}

/** Title, then what is true about it. Controls belong to the stage, not a card. */
export function CardHeader({
  title,
  meta,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
      <h2 className="shrink-0 text-[18px] font-semibold leading-none text-ink">{title}</h2>
      {meta && <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">{meta}</div>}
    </div>
  );
}

/** Body region that grows to fill, so footers align across peer columns. */
export function CardBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return <div className={`flex-1 px-4 py-1 ${className}`}>{children}</div>;
}

/** Nothing to show, in the one weight every surface says it in. */
export function EmptyState({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return <p className={`text-[13px] leading-snug text-ink-3 ${className}`}>{children}</p>;
}

/** Action strip glued to the bottom of its card (feedback adjacency). */
export function CardFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`mt-auto flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3 ${className}`}
    >
      {children}
    </div>
  );
}
