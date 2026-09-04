---
title: The tick
description: One tick is one simulated hour — the order that hour resolves in, and why the state is replaced rather than edited.
---

## One tick is one hour

The engine advances in whole simulated hours. There are no partial ticks, no
variable timesteps, no sub-hour ordering. Everything a tank does in an hour
settles in one call, and the hour is the smallest thing that exists.

The rest of time is derived from a single counter. Hour of day is that counter
modulo 24 and day number is it divided by 24, so a photoperiod, a feeding routine
and a month of cycling are all read off the same integer.

## What an hour resolves in

| Stage | What settles | Why here |
|---|---|---|
| Environment | The clock advances, the passive readings are recomputed — light, flow, surface, aeration — then room-driven drift and evaporation apply | The hour has to exist before anything can read it |
| Equipment | Substrate, heater, top-off, CO₂ and doser act on the water they have just met | Equipment answers conditions, so it cannot run ahead of them |
| Biology | Plants, then algae, then livestock, then breeding | Each reads the one before it |
| Resources | Decay, nitrification, gas exchange and pH drift move what the living just produced | The chemistry closes the hour's books on everything emitted above |
| Alerts | Thresholds are compared against the settled hour, and each crossing is logged once | An alert on a mid-tick number describes a state the tank was never in |

## Order is a read graph, not a preference

The sequence exists so that every reader sees a value that has already settled
this hour. Plants read the equipment's hour, algae read the plant conditions
plants have just written, livestock read a tank the flora has already been
through. Reversing any pair would not break anything visibly — it would quietly
make one of them an hour stale.

Inside a stage the opposite rule holds. Systems in the same tier all read the
same state and their results are applied together, so two of them drawing on one
pool in the same hour never see each other's withdrawal. That is safe only
because every draw is shaped so it cannot overdraw, which is
[rates into stocks](/concepts/rates-into-stocks/) doing the scheduling.

## The state is replaced, never edited

A tick takes a state and returns a new one. Nothing is mutated in place, and the
state handed in is still valid and still readable after the call.

| Property | What it buys |
|---|---|
| The input state survives the call | The hour can be diffed, replayed, or kept as an undo point |
| Changes are data before they are changes | Every movement of a resource carries the mechanism that produced it |
| Randomness is a serializable seed | The same state and the same seed give the same hour on any machine |
| Nothing reads a wall clock | The engine's only notion of time is the counter it is handed |

## What happens outside the tick

Keeper actions apply immediately rather than waiting for the hour to turn:
feeding, water changes, dosing, planting, trimming, scrubbing algae, and adding
or removing stock. They are the one path by which anything outside the engine
changes a tank, and the next tick meets the tank they left behind.

## Source

`src/simulation/` — the tick and the system registry at its root, the core
systems under `systems/`, the devices under `equipment/`, and the per-organism
orchestrators under `plants/`, `algae/` and `livestock/`.
