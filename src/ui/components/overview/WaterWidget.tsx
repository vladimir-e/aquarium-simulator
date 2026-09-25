import React from 'react';
import type { VerbId } from '../../actions';
import type { ReadingBook, ReadingId } from '../../readings';
import { ReadingRows } from '../water/rows';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

/** The four physical readings, then the two dissolved gases. */
const ROWS: ReadingId[] = ['temperature', 'ph', 'kh', 'gh', 'level', 'oxygen', 'co2'];

export function WaterWidget({
  book,
  onOpenReading,
  onAct,
  actLabel,
}: {
  book: ReadingBook;
  onOpenReading: (id: ReadingId) => void;
  onAct: (verb: VerbId) => void;
  actLabel: (verb: VerbId) => string;
}): React.JSX.Element {
  return (
    <Widget
      title="Water"
      caption={book.caption}
      to="/water"
      footer={
        <>
          <VerbButton label={actLabel('waterChange')} onClick={() => onAct('waterChange')} />
          <VerbButton label={actLabel('topOff')} onClick={() => onAct('topOff')} />
        </>
      }
    >
      <ReadingRows book={book} ids={ROWS} onOpen={onOpenReading} />
    </Widget>
  );
}
