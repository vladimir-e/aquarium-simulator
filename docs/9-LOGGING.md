# Event Logging

The simulation logs all significant events occurring in the ecosystem. This serves two purposes:
1. **Educational** - Helps users understand how the simulation works
2. **Debugging** - Provides visibility into system behavior

## Design Principles

- Log events as they happen
- Include enough context to understand cause and effect
- Every log entry includes the tick number for timeline reconstruction

## Log Entry Structure

Each log entry contains:
- **tick** - Simulation tick when event occurred
- **source** - system emitting the event e.g. equipment, livestock, plants, action
- **event** - Specific event type
- **message** - Human-readable description

## Usage

Logs can be:
- Displayed in real-time as simulation runs
- Filtered by category or event type
- Exported for analysis
- Used to reconstruct simulation history
