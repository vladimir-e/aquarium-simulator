import React from 'react';
import type { SimulationState } from '../../../simulation/index.js';
import type { VerbId } from '../../actions';
import type { ReadingBook, ReadingId } from '../../readings';
import { nutrientAlert } from '../../run';
import { NutrientRows } from '../water/rows';
import { VerbButton } from '../ui/VerbButton';
import { Widget } from '../ui/Widget';

interface NutrientsWidgetProps {
  book: ReadingBook;
  state: SimulationState;
  onOpenReading: (id: ReadingId) => void;
  onAct: (verb: VerbId, at?: number) => void;
  /** The dose the plants are short of is a label the widget can ask for. */
  actLabel: (verb: VerbId, at?: number) => string;
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
  actLabel,
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
            label={actLabel('dose', advice?.ml)}
            hot={advice !== null}
            onClick={() => onAct('dose', advice?.ml)}
          />
          <p className="text-[12px] text-ink-3">1 ml moves {perMl}</p>
        </>
      }
    >
      <NutrientRows book={book} onOpen={onOpenReading} />
    </Widget>
  );
}
