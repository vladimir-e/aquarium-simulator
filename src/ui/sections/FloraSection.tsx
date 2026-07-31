import React, { useMemo } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Stage } from '../components/layout/Stage';
import { AddHardscape, AddPlant } from '../components/flora/AddControls';
import { NutrientsCard } from '../components/flora/NutrientsCard';
import { PlantsCard } from '../components/flora/PlantsCard';
import { ScapeCard } from '../components/flora/ScapeCard';
import {
  algaeRow,
  doseDeltas,
  doseToCover,
  nutrientAlert,
  nutrientReadings,
  plantRows,
  plantsAndAlgae,
  tankDemand,
} from '../run';

/**
 * Plants and the algae competing with them, the nutrients that feed both, and
 * the scape they grow in. Nutrients sits here rather than in a section of its
 * own because the only reason to read a nutrient bar is to explain a plant.
 */
export function FloraSection({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: TunableConfig;
}): React.JSX.Element {
  const isMobile = useIsMobile();
  const { state } = sim;

  const rows = useMemo(() => plantRows(state, config), [state, config]);
  const algae = useMemo(() => algaeRow(state, config), [state, config]);
  const readings = useMemo(() => nutrientReadings(state, config), [state, config]);

  return (
    <Stage
      title="Flora & Scape"
      meta={plantsAndAlgae(state)}
      actions={
        !isMobile && (
          <>
            <AddPlant sim={sim} opens="down" />
            <AddHardscape sim={sim} opens="down" />
          </>
        )
      }
    >
      <div className="flex min-h-full flex-col gap-3 lg:flex-row">
        <PlantsCard
          className="lg:w-[60%]"
          rows={rows}
          algae={algae}
          onRemove={(plantId) => sim.executeAction({ type: 'removePlant', plantId })}
          footer={isMobile && <AddPlant sim={sim} opens="up" />}
        />
        <div className="flex min-h-0 flex-col gap-3 lg:flex-1">
          <NutrientsCard
            readings={readings}
            alert={nutrientAlert(readings)}
            demand={tankDemand(state)}
            perMl={doseDeltas(1, state.resources.water, config.nutrients.fertilizerFormula)}
            cover={doseToCover(readings, state, config)}
          />
          <ScapeCard sim={sim} footer={isMobile && <AddHardscape sim={sim} opens="up" />} />
        </div>
      </div>
    </Stage>
  );
}
