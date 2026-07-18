import React from 'react';
import { Caret } from './elements';

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

interface CardHeaderProps {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  /** Render the header as a collapse toggle (mobile stacking). */
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Id of the CollapseRegion this header toggles (for aria-controls). */
  regionId?: string;
}

export function CardHeader({
  title,
  meta,
  action,
  collapsible = false,
  collapsed = false,
  onToggle,
  regionId,
}: CardHeaderProps): React.JSX.Element {
  const titleBlock = (
    <>
      {collapsible && <Caret open={!collapsed} className="shrink-0" />}
      <h2 className="text-[18px] font-semibold leading-none text-ink">{title}</h2>
      {meta && <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">{meta}</div>}
    </>
  );

  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={regionId}
          className="-my-3 flex min-w-0 flex-1 items-center gap-2 self-stretch py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {titleBlock}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2">{titleBlock}</div>
      )}
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

/**
 * Wraps the parts of a card that collapse on mobile. `display: contents` keeps
 * the children as direct flex items of the card (so footer `mt-auto` still
 * works and desktop is untouched); when collapsed it hides them below `sm` only.
 */
export function CollapseRegion({
  collapsed,
  id,
  children,
}: {
  collapsed: boolean;
  id?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div id={id} className={collapsed ? 'max-sm:hidden sm:contents' : 'contents'}>
      {children}
    </div>
  );
}
