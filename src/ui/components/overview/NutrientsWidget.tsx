import React from 'react';
import type { SimulationState } from '../../../simulation/index.js';
import type { ReadingBook, ReadingId } from '../../readings';
import { nutrientAlert } from '../../run';
import { ReadingRow } from '../ui/ReadingRow';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

interface NutrientsWidgetProps {
  book: ReadingBook;
  state: SimulationState;
  onOpenReading: (id: ReadingId) => void;
  onAct: () => void;
}

/**
 * The four plant foods against what the plants are asking for — the one place
 * the tank's nitrate is read as food rather than as the toxin the cycle ends
 * in, and the millilitre that moves all four.
 */
export function NutrientsWidget({
  book,
  state,
  onOpenReading,
  onAct,
}: NutrientsWidgetProps): React.JSX.Element {
  const { advice, perMl } = book.dose;
  const alert = nutrientAlert(book.nutrients);

  return (
    <Widget
      title="Nutrients"
      caption={
        state.plants.length === 0
          ? 'no plants to feed'
          : (alert?.text ?? 'plants have what they need')
      }
      to="/water"
      footer={
        <>
          <VerbButton
            label={advice ? `Dose · ${advice.ml} ml` : 'Dose'}
            hot={advice !== null}
            onClick={onAct}
          />
          <p className="text-[12px] text-ink-3">1 ml moves {perMl}</p>
        </>
      }
    >
      {book.demand.map((reading) => (
        <ReadingRow
          key={reading.id}
          name={reading.name}
          value={reading.value}
          unit={reading.unit}
          at={reading.at}
          band={reading.band}
          tone={reading.tone}
          note={reading.need}
          onClick={() => onOpenReading(reading.id)}
        />
      ))}
    </Widget>
  );
}
