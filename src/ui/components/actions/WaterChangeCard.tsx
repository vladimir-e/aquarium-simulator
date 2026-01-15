import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { Select } from '../ui/Select';
import type { WaterChangeAmount } from '../../../simulation/index.js';
import { WATER_CHANGE_AMOUNTS } from '../../../simulation/index.js';

interface WaterChangeCardProps {
  waterLevel: number;
  tapWaterTemperature: number;
  onWaterChange: (amount: WaterChangeAmount) => void;
  onTapWaterTemperatureChange: (temp: number) => void;
}

export function WaterChangeCard({
  waterLevel,
  tapWaterTemperature,
  onWaterChange,
  onTapWaterTemperatureChange,
}: WaterChangeCardProps): React.JSX.Element {
  const [selectedAmount, setSelectedAmount] = useState<WaterChangeAmount>(0.25);

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
        value={tapWaterTemperature}
        onChange={onTapWaterTemperatureChange}
        min={5}
        max={40}
        step={1}
        suffix="°C"
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
        Will change {waterToChange.toFixed(1)}L of {waterLevel.toFixed(1)}L
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
