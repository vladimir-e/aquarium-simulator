import React from 'react';

interface StepperProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
}: StepperProps) {
  const handleDecrement = () => {
    const newValue = value - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  };

  const handleIncrement = () => {
    const newValue = value + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-gray-400">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleDecrement}
          disabled={min !== undefined && value <= min}
          className="w-8 h-8 bg-panel border border-border rounded hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
        >
          -
        </button>
        <span className="text-sm text-gray-200 min-w-[3rem] text-center">
          {value}
          {suffix}
        </span>
        <button
          onClick={handleIncrement}
          disabled={max !== undefined && value >= max}
          className="w-8 h-8 bg-panel border border-border rounded hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  );
}
