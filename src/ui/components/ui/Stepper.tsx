interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  formatValue?: (value: number) => string;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = '',
  formatValue,
}: StepperProps) {
  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  };

  const displayValue = formatValue ? formatValue(value) : value;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs text-text-secondary">{label}</label>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={value <= min}
          className="w-7 h-7 flex items-center justify-center bg-bg-input border border-border rounded text-text-primary hover:bg-border-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Decrease"
        >
          −
        </button>
        <div className="min-w-[60px] text-center text-sm text-text-primary font-medium">
          {displayValue}
          {unit && <span className="text-text-secondary ml-0.5">{unit}</span>}
        </div>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={value >= max}
          className="w-7 h-7 flex items-center justify-center bg-bg-input border border-border rounded text-text-primary hover:bg-border-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Increase"
        >
          +
        </button>
      </div>
    </div>
  );
}
