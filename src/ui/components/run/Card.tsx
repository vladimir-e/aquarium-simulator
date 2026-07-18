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

export function CardHeader({
  title,
  meta,
  action,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-[18px] font-semibold leading-none text-ink">{title}</h2>
        {meta && <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">{meta}</div>}
      </div>
      {action}
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

/** Action strip glued to the bottom of its card (feedback adjacency). */
export function CardFooter({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
      {children}
    </div>
  );
}
