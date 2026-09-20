import { describe, it, expect } from "vitest";
import {
  createSimulation,
  tick,
  type DailySchedule,
  type SimulationState,
} from "../../simulation/index.js";
import { DEFAULT_CONFIG } from "../../simulation/config/index.js";
import {
  hourLabel,
  rackSchedules,
  scheduleEnd,
  scheduleHours,
  scheduleRange,
  scheduleSpans,
  scheduleWithEnd,
  scheduleWithStart,
} from "./schedules";

const base: SimulationState = createSimulation({ tankCapacity: 40 });

/** Advance the tank to a given hour of day 1. */
function atHour(hour: number, state: SimulationState = base): SimulationState {
  let next = state;
  for (let i = 0; i < hour; i++) next = tick(next, DEFAULT_CONFIG);
  return next;
}

describe("scheduleSpans", () => {
  it("lights one stretch for a daytime schedule", () => {
    expect(scheduleSpans({ startHour: 6, duration: 12 })).toEqual([
      { from: 0.25, to: 0.75 },
    ]);
  });

  it("lights both ends of the track when the schedule crosses midnight", () => {
    expect(scheduleSpans({ startHour: 22, duration: 4 })).toEqual([
      { from: 22 / 24, to: 1 },
      { from: 0, to: 2 / 24 },
    ]);
  });

  it("fills the day for a 24 h schedule and stays inside the track past it", () => {
    expect(scheduleSpans({ startHour: 0, duration: 24 })).toEqual([
      { from: 0, to: 1 },
    ]);
    expect(scheduleSpans({ startHour: 8, duration: 48 })).toEqual([
      { from: 8 / 24, to: 1 },
      { from: 0, to: 8 / 24 },
    ]);
  });

  it("lights nothing for a schedule with no hours in it", () => {
    expect(scheduleSpans({ startHour: 8, duration: 0 })).toEqual([]);
  });
});

describe("scheduleHours", () => {
  it("fits the span into five characters, and wraps past midnight", () => {
    expect(scheduleHours({ startHour: 8, duration: 10 })).toBe("08–18");
    expect(scheduleHours({ startHour: 22, duration: 5 })).toBe("22–03");
  });

  it("names a full day rather than printing a zero-length span", () => {
    expect(scheduleHours({ startHour: 8, duration: 24 })).toBe("all day");
    expect(scheduleHours({ startHour: 8, duration: 48 })).toBe("all day");
  });
});

describe("scheduleRange", () => {
  it("pads both ends and wraps past midnight", () => {
    expect(scheduleRange({ startHour: 8, duration: 10 })).toBe("08:00–18:00");
    expect(scheduleRange({ startHour: 22, duration: 5 })).toBe("22:00–03:00");
    expect(hourLabel(0)).toBe("00:00");
  });

  it("names a full day rather than printing a zero-length range", () => {
    expect(scheduleRange({ startHour: 8, duration: 24 })).toBe("all day");
    expect(scheduleRange({ startHour: 0, duration: 24 })).toBe("all day");
  });
});

describe("editing a schedule on its ends", () => {
  const noon: DailySchedule = { startHour: 8, duration: 10 }; // 08:00–18:00

  const cases: [
    name: string,
    from: DailySchedule,
    end: number,
    want: DailySchedule,
  ][] = [
    [
      "an end past the start wraps forward through midnight",
      noon,
      7,
      { startHour: 8, duration: 23 },
    ],
    [
      "an end stepped down off midnight lands on 23",
      { startHour: 20, duration: 4 },
      -1,
      { startHour: 20, duration: 3 },
    ],
    [
      "an end onto the start is the whole day",
      noon,
      8,
      { startHour: 8, duration: 24 },
    ],
    [
      "an end past 23 wraps onto 00",
      { startHour: 8, duration: 15 },
      24,
      { startHour: 8, duration: 16 },
    ],
  ];

  it.each(cases)("%s", (_name, from, end, want) => {
    expect(scheduleWithEnd(from, end)).toEqual(want);
  });

  const startCases: [
    name: string,
    from: DailySchedule,
    start: number,
    want: DailySchedule,
  ][] = [
    [
      "moving the start holds the end where it was",
      noon,
      10,
      { startHour: 10, duration: 8 },
    ],
    [
      "a start past the end wraps forward through midnight",
      noon,
      20,
      { startHour: 20, duration: 22 },
    ],
    [
      "a start stepped down off midnight lands on 23",
      { startHour: 0, duration: 6 },
      -1,
      { startHour: 23, duration: 7 },
    ],
    [
      "a start onto the end is the whole day",
      noon,
      18,
      { startHour: 18, duration: 24 },
    ],
  ];

  it.each(startCases)("%s", (_name, from, start, want) => {
    expect(scheduleWithStart(from, start)).toEqual(want);
  });

  it("reads the end back off a schedule that is stored as a duration", () => {
    expect(scheduleEnd(noon)).toBe(18);
    expect(scheduleEnd({ startHour: 22, duration: 5 })).toBe(3);
    expect(scheduleEnd({ startHour: 8, duration: 24 })).toBe(8);
  });
});

describe("rackSchedules", () => {
  it("puts the cursor on the tank’s hour of day", () => {
    expect(rackSchedules(base).hour).toBe(0);
    expect(rackSchedules(atHour(14)).hour).toBe(14);
  });

  it("carries the three scheduled devices, in rack order", () => {
    expect(rackSchedules(base).rows.map((r) => r.id)).toEqual([
      "light",
      "co2Generator",
      "autoDoser",
    ]);
  });

  it("marks the light active only while its photoperiod covers the hour", () => {
    const light = (state: SimulationState): boolean =>
      rackSchedules(state).rows[0].active;
    // Default photoperiod is 08:00–18:00.
    expect(light(atHour(7))).toBe(false);
    expect(light(atHour(9))).toBe(true);
    expect(light(atHour(19))).toBe(false);
  });

  it("gives the doser the single hour it fires in", () => {
    const dosing: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        autoDoser: { ...base.equipment.autoDoser, enabled: true },
      },
    };
    const row = rackSchedules(dosing).rows[2];
    expect(row.spans).toEqual([{ from: 8 / 24, to: 9 / 24 }]);
    expect(row.hours).toBe("08:00");
    expect(rackSchedules(atHour(8, dosing)).rows[2].active).toBe(true);
    expect(rackSchedules(atHour(9, dosing)).rows[2].active).toBe(false);
  });

  it("plots nothing for a device that is off, and claims no hours for it", () => {
    const row = rackSchedules(base).rows[1];
    expect(row.enabled).toBe(false);
    expect(row.spans).toEqual([]);
    expect(row.hours).toBe("");
    expect(rackSchedules(base).rows[2].hours).toBe("");
  });
});
