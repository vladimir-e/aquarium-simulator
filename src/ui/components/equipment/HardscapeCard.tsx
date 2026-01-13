import React, { useState } from 'react';
import { Mountain } from 'lucide-react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import {
  getHardscapeName,
  getHardscapeSurface,
  getHardscapePHEffect,
  type HardscapeType,
  type HardscapeItem,
} from '../../../simulation/index.js';

export type { HardscapeType, HardscapeItem };

export interface HardscapeState {
  items: HardscapeItem[];
}

interface HardscapeCardProps {
  hardscape: HardscapeState;
  usedSlots: number;
  totalSlots: number;
  onAddItem: (type: HardscapeType) => void;
  onRemoveItem: (id: string) => void;
}

const HARDSCAPE_TYPES: HardscapeType[] = [
  'neutral_rock',
  'calcite_rock',
  'driftwood',
  'plastic_decoration',
];

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function HardscapeCard({
  hardscape,
  usedSlots,
  totalSlots,
  onAddItem,
  onRemoveItem,
}: HardscapeCardProps): React.JSX.Element {
  const [selectedType, setSelectedType] = useState<HardscapeType>('neutral_rock');

  const canAddMore = usedSlots < totalSlots;
  const phEffect = getHardscapePHEffect(selectedType);

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Mountain className="w-4 h-4 text-gray-400" />
        <h4 className="text-sm font-medium text-gray-200">Hardscape</h4>
      </div>

      <div className="space-y-3 flex-1">
        {/* Slot usage */}
        <div className="text-xs text-gray-400 flex justify-between">
          <span>Slots:</span>
          <span className="text-gray-300">
            {usedSlots}/{totalSlots}
          </span>
        </div>

        {/* Add hardscape */}
        <Select
          label="Type"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as HardscapeType)}
          disabled={!canAddMore}
        >
          {HARDSCAPE_TYPES.map((type) => (
            <option key={type} value={type}>
              {getHardscapeName(type)}
            </option>
          ))}
        </Select>

        {/* Show stats for selected type */}
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Surface:</span>
            <span className="text-gray-300">{formatNumber(getHardscapeSurface(selectedType))} cm²</span>
          </div>
          {phEffect && (
            <div className="flex justify-between">
              <span>pH Effect:</span>
              <span className="text-gray-300">{phEffect}</span>
            </div>
          )}
        </div>

        <Button onClick={() => onAddItem(selectedType)} disabled={!canAddMore}>
          Add Item
        </Button>

        {/* Current items list */}
        {hardscape.items.length > 0 && (
          <div className="border-t border-border pt-2 space-y-1">
            <div className="text-xs text-gray-400 mb-1">Current Items:</div>
            {hardscape.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs bg-border/30 p-2 rounded"
              >
                <span className="text-gray-300">{getHardscapeName(item.type)}</span>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove item"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {hardscape.items.length === 0 && (
          <div className="text-xs text-gray-500 italic">No hardscape items</div>
        )}
      </div>
    </div>
  );
}
