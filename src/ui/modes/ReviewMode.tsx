import React from 'react';
import { ModePlaceholder } from './ModePlaceholder';

export function ReviewMode(): React.JSX.Element {
  return (
    <ModePlaceholder
      title="Review"
      note="Replay the run — charts, summary, and the full log on a scrubber. Coming in this redesign."
    />
  );
}
