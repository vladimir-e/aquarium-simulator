import React from 'react';

interface StageProps {
  title: string;
  meta?: React.ReactNode;
  /** Section-owned controls — construction verbs, view switches. */
  actions?: React.ReactNode;
  /** The section fills the stage exactly and owns whatever scrolls inside it. */
  fills?: boolean;
  /** Band pinned below the body, spanning the stage edge to edge. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** The routed surface: one section at a time, owning the whole right-hand side. */
export function Stage({ title, meta, actions, fills, footer, children }: StageProps): React.JSX.Element {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-hairline bg-surface">
      <div className="flex min-h-[52px] shrink-0 items-center gap-2.5 border-b border-hairline px-3.5">
        <h1 className="text-[19px] font-semibold tracking-[-0.015em]">{title}</h1>
        {meta && <span className="truncate text-[12.5px] text-ink-3">{meta}</span>}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={`min-h-0 flex-1 p-3 ${fills ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {children}
      </div>
      {footer}
    </main>
  );
}
