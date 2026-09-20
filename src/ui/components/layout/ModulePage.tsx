import React from 'react';

/** A headed run of rows — the only structure a module has below its columns. */
export function ModuleGroup({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="pt-3 first:pt-0">
      <div className="flex items-baseline gap-2 pb-1">
        <h2 className="text-[13px] font-medium leading-[18px] text-ink-2">{title}</h2>
        {meta && <span className="min-w-0 truncate text-[12px] text-ink-3">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

interface ModulePageProps {
  title: string;
  meta?: React.ReactNode;
  /** Module-owned controls — construction verbs, view switches. */
  actions?: React.ReactNode;
  /** The module fills the stage exactly and owns whatever scrolls inside it. */
  fills?: boolean;
  /** Band pinned below the body, spanning the stage edge to edge. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A module at full stage: the page title, and the module's own surface under
 * it. The frame itself is unbordered — widgets are the bordered level. The
 * stage's `main` landmark belongs to the shell, so a page is a section in it.
 */
export function ModulePage({
  title,
  meta,
  actions,
  fills,
  footer,
  children,
}: ModulePageProps): React.JSX.Element {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-1.5">
        <h1 className="text-[20px] font-medium leading-6">{title}</h1>
        {meta && <span className="min-w-0 truncate text-[13px] text-ink-2">{meta}</span>}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={`min-h-0 flex-1 px-3 pb-3 ${fills ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {children}
      </div>
      {footer}
    </section>
  );
}
