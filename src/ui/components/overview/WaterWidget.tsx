import React from 'react';
import type { ReadingBook, ReadingId } from '../../readings';
import { ReadingRows } from '../water/rows';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

/** The three physical readings, then the two dissolved gases. */
const ROWS: ReadingId[] = ['temperature', 'ph', 'level', 'oxygen', 'co2'];

export function WaterWidget({
  book,
  onOpenReading,
  onAct,
}: {
  book: ReadingBook;
  onOpenReading: (id: ReadingId) => void;
  onAct: () => void;
}): React.JSX.Element {
  return (
    <Widget
      title="Water"
      caption={book.caption}
      to="/water"
      footer={
        <>
          <VerbButton label="Water change · 25 %" onClick={onAct} />
          <VerbButton label="Top off" onClick={onAct} />
        </>
      }
    >
      <ReadingRows book={book} ids={ROWS} onOpen={onOpenReading} />
    </Widget>
  );
}
