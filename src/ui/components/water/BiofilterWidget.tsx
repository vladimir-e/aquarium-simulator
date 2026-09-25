import React from 'react';
import type { ReadingBook } from '../../readings';
import { bacteriaSummary, cycleWord } from '../../run';
import { Widget } from '../ui/Widget';
import { ColonyRows } from './rows';

interface BiofilterWidgetProps {
  book: ReadingBook;
  title?: string;
  to?: string;
  className?: string;
  /** Laid above the guilds, under the same cycle word and the same summary. */
  children?: React.ReactNode;
}

/**
 * The bacteria that run the cycle: how big each guild is against the surface
 * it can colonise, what it is converting this hour, and the one sentence the
 * two of them add up to — including where the nitrite peak falls. The
 * Overview's Nitrogen widget is this one with the chain of stocks laid over it.
 */
export function BiofilterWidget({
  book,
  title = 'Biofilter',
  to,
  className,
  children,
}: BiofilterWidgetProps): React.JSX.Element {
  return (
    <Widget
      title={title}
      caption={cycleWord(book.bacteria.cycled)}
      to={to}
      className={className}
      footer={
        <p className="text-[12px] leading-4 text-ink-3">
          {bacteriaSummary(book.bacteria, book.projection)}
        </p>
      }
    >
      {children}
      <div className={children ? 'mt-1 border-t border-hairline pt-0.5' : undefined}>
        <ColonyRows bacteria={book.bacteria} />
      </div>
    </Widget>
  );
}
