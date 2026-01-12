import { Panel } from '../layout/Panel';
import { Select } from '../ui';

interface TankSizePanelProps {
  capacity: number;
  onCapacityChange: (capacity: number) => void;
}

const TANK_SIZE_OPTIONS = [
  { value: 20, label: '20L (~5 gal)' },
  { value: 40, label: '40L (~10 gal)' },
  { value: 75, label: '75L (~20 gal)' },
  { value: 150, label: '150L (~40 gal)' },
  { value: 200, label: '200L (~50 gal)' },
  { value: 300, label: '300L (~75 gal)' },
  { value: 400, label: '400L (~100 gal)' },
];

export function TankSizePanel({
  capacity,
  onCapacityChange,
}: TankSizePanelProps) {
  return (
    <Panel title="Tank Size">
      <Select
        options={TANK_SIZE_OPTIONS}
        value={capacity}
        onChange={(v) => onCapacityChange(Number(v))}
      />
      <p className="mt-2 text-xs text-text-muted">
        Changing size resets simulation
      </p>
    </Panel>
  );
}
