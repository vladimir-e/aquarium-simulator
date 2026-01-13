import React from 'react';
import { Panel } from '../layout/Panel';
import { Select } from '../ui/Select';

interface TankSizeProps {
  capacity: number;
  onCapacityChange: (capacity: number) => void;
}

const tankSizes = [
  { liters: 20, display: '20L (5 gal)' },
  { liters: 40, display: '40L (10 gal)' },
  { liters: 75, display: '75L (20 gal)' },
  { liters: 150, display: '150L (40 gal)' },
  { liters: 200, display: '200L (50 gal)' },
  { liters: 300, display: '300L (75 gal)' },
  { liters: 400, display: '400L (100 gal)' },
];

export function TankSize({ capacity, onCapacityChange }: TankSizeProps): React.JSX.Element {
  return (
    <Panel title="Tank Size">
      <Select
        value={capacity}
        onChange={(e) => onCapacityChange(Number(e.target.value))}
      >
        {tankSizes.map((size) => (
          <option key={size.liters} value={size.liters}>
            {size.display}
          </option>
        ))}
      </Select>
    </Panel>
  );
}
