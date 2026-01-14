# Logging and Alerts

The simulation provides two systems for observability:

1. **Event Logging** - Records all significant events as they occur
2. **Alert System** - Monitors critical conditions and warns users

Together, these help users understand ecosystem dynamics and respond to problems.

---

## Event Logging

### Design Principles

- Log events as they happen
- Include enough context to understand cause and effect
- Every log entry includes the tick number for timeline reconstruction

### Log Entry Structure

Each log entry contains:
- **tick** - Simulation tick when event occurred
- **source** - system emitting the event e.g. equipment, livestock, plants, action
- **event** - Specific event type
- **message** - Human-readable description

### Usage

Logs can be:
- Displayed in real-time as simulation runs
- Filtered by category or event type
- Exported for analysis
- Used to reconstruct simulation history

---

## Alert System

The alert system monitors critical conditions and warns users when intervention may be needed.

### Design Principles

- **Persistent warnings** - Alerts remain active in the UI until the condition is resolved
- **Stateful** - Track when alerts activate and clear automatically when situation improves
- **Threshold-based** - Trigger when values cross defined thresholds (entering AND exiting)
- **Non-blocking** - Alerts warn but don't stop simulation

### Behavior

**Alert Lifecycle:**
1. **Activate** - Alert fires when threshold is crossed (e.g., water level drops below 80%)
2. **Persist** - Alert state remains active and visible in UI
3. **Clear** - Alert automatically clears when condition resolves (e.g., water topped off to safe level)

**Logging:**
- Log entry created when alert **activates** (crossing into warning state)
- Log entry created when alert **clears** (crossing back to safe state)
- No repeated warnings while alert remains active

This prevents log spam while ensuring users see persistent warnings in the UI for ongoing issues.

### Current Alerts

| Alert | Threshold | Clears When |
|-------|-----------|-------------|
| **Water Level** | < 80% capacity | ≥ 85% capacity |
| **Temperature** | Outside safe range for species | Returns to safe range |
| **Oxygen** | < 5 ppm | ≥ 6 ppm |
| **Ammonia/Nitrite** | > 0.25 ppm | < 0.1 ppm |

*Note: Some alerts listed above are planned but not yet implemented.*

### Future Considerations

- **Severity levels** - Info, warning, critical
- **Snooze/Acknowledge** - User can dismiss non-critical alerts temporarily
- **Alert history** - Track how often alerts occur to identify chronic problems
