import { Panel } from '../layout/Panel';

interface VisualizationPanelProps {
  waterLevel: number;
  capacity: number;
}

export function VisualizationPanel({
  waterLevel,
  capacity,
}: VisualizationPanelProps) {
  const percentage = capacity > 0 ? (waterLevel / capacity) * 100 : 0;

  return (
    <Panel title="Visualization" className="h-full">
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] bg-accent-blue/20 rounded-lg border border-accent-blue/30">
        {/* Simple tank visualization */}
        <div className="relative w-16 h-32 bg-bg-primary rounded-b-lg border-2 border-border overflow-hidden">
          {/* Water fill */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-accent-blue/60 transition-all duration-500"
            style={{ height: `${percentage}%` }}
          />
          {/* Water label */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-medium text-text-primary bg-bg-primary/70 px-1 rounded">
              Water
            </span>
          </div>
        </div>

        {/* Water level percentage */}
        <div className="mt-4 text-center">
          <div className="text-2xl font-bold text-text-primary">
            {percentage.toFixed(1)}%
          </div>
          <div className="text-xs text-text-secondary">
            {waterLevel.toFixed(1)}L / {capacity}L
          </div>
        </div>
      </div>
    </Panel>
  );
}
