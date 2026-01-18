import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { Select } from '../ui/Select';
import type { WaterChangeAmount } from '../../../simulation/index.js';
import { WATER_CHANGE_AMOUNTS } from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';

interface WaterChangeCardProps {
  waterLevel: number;
  tapWaterTemperature: number;
  tapWaterPH: number;
  onWaterChange: (amount: WaterChangeAmount) => void;
  onTapWaterTemperatureChange: (temp: number) => void;
  onTapWaterPHChange: (ph: number) => void;
}

export function WaterChangeCard({
  waterLevel,
  tapWaterTemperature,
  tapWaterPH,
  onWaterChange,
  onTapWaterTemperatureChange,
  onTapWaterPHChange,
}: WaterChangeCardProps): React.JSX.Element {
  const { unitSystem, tempUnit, formatVol, displayTemp, internalTemp } = useUnits();
  const [selectedAmount, setSelectedAmount] = useState<WaterChangeAmount>(0.25);

  // Convert internal Celsius to display value (rounded for imperial)
  const tapTempDisplayValue = Math.round(displayTemp(tapWaterTemperature));

  // Min/max in display units for tap water temperature
  const minTapTemp = unitSystem === 'imperial' ? 41 : 5; // 5°C = 41°F
  const maxTapTemp = unitSystem === 'imperial' ? 104 : 40; // 40°C = 104°F

  const handleTapTempChange = (newDisplayValue: number): void => {
    onTapWaterTemperatureChange(internalTemp(newDisplayValue));
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedAmount(parseFloat(e.target.value) as WaterChangeAmount);
  };

  const handleWaterChange = (): void => {
    onWaterChange(selectedAmount);
  };

  const waterToChange = waterLevel * selectedAmount;
  const hasWater = waterLevel > 0;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="text-xs text-gray-400 font-medium">Water Change</div>

      {/* Tap water temperature stepper */}
      <Stepper
        label="Tap water temp"
        value={tapTempDisplayValue}
        onChange={handleTapTempChange}
        min={minTapTemp}
        max={maxTapTemp}
        step={1}
        suffix={tempUnit}
      />

      {/* Tap water pH stepper */}
      <Stepper
        label="Tap water pH"
        value={tapWaterPH}
        onChange={onTapWaterPHChange}
        min={5.5}
        max={8.5}
        step={0.1}
        suffix=""
      />

      {/* Amount selector */}
      <Select
        label="Amount"
        value={selectedAmount.toString()}
        onChange={handleAmountChange}
      >
        {WATER_CHANGE_AMOUNTS.map((amount) => (
          <option key={amount} value={amount}>
            {Math.round(amount * 100)}%
          </option>
        ))}
      </Select>

      {/* Water change info */}
      <div className="text-xs text-gray-400">
        Will change {formatVol(waterToChange)} of {formatVol(waterLevel)}
      </div>

      {/* Water change button */}
      <Button
        onClick={handleWaterChange}
        disabled={!hasWater}
        variant="primary"
      >
        Change Water
      </Button>
    </div>
  );
}
