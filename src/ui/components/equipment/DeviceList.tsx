import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EquipmentId, EquipmentRow } from '../../build';
import { StatusDot } from '../run/elements';

export function DeviceList({
  rows,
  selected,
  query,
}: {
  rows: EquipmentRow[];
  selected: EquipmentId | null;
  query: string;
}): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="px-4 py-4 text-[13px] text-ink-3">No device matches “{query}”.</p>;
  }

  return (
    <ul className="divide-y divide-hairline px-2">
      {rows.map((row) => {
        const isSelected = row.id === selected;
        return (
          <li key={row.id}>
            <Link
              to={`/equipment/${row.id}`}
              data-device={row.id}
              aria-current={isSelected ? 'page' : undefined}
              className={`flex min-h-[44px] items-center gap-2.5 rounded px-2 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                isSelected
                  ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]'
                  : 'hover:bg-surface-2'
              }`}
            >
              <StatusDot on={row.on} />
              <span className={`text-[14px] text-ink ${isSelected ? 'font-medium' : ''}`}>
                {row.name}
              </span>
              <span className="ml-auto truncate font-mono text-[12px] tabular-nums text-ink-2">
                {row.summary}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 sm:hidden" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
