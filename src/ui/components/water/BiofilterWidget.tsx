import React from 'react';
import type { TunableConfig } from '../../../simulation/config/index.js';
import type { ReadingBook } from '../../readings';
import { bacteriaSummary, cycleWord } from '../../run';
import { Widget } from '../ui/Widget';
import { ColonyRows } from './rows';

/**
 * The bacteria that run the cycle: how big each guild is against the surface
 * it can colonise, what it is converting this hour, and the one sentence the
 * two of them add up to — including where the nitrite peak falls.
 */
export function BiofilterWidget({
  book,
  config,
}: {
  book: ReadingBook;
  config: TunableConfig;
}): React.JSX.Element {
  return (
    <Widget
      title="Biofilter"
      caption={cycleWord(book.bacteria.cycled)}
      footer={
        <p className="text-[12px] leading-4 text-ink-3">
          {bacteriaSummary(book.bacteria, book.projection, config.nitrogenCycle)}
        </p>
      }
    >
      <ColonyRows bacteria={book.bacteria} />
    </Widget>
  );
}
