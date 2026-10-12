import { describe, it, expect } from 'vitest';
import {
  arrheniusFactor,
  hourlyDraw,
  hourlyDraws,
  hourlyInflowDraw,
  lightSaturationFactor,
  meanOfExp,
  monodFactor,
  monodUptake,
  q10Factor,
  stockLeft,
} from './kinetics.js';

describe('q10Factor', () => {
  it('leaves a rate alone at the temperature it is quoted at', () => {
    expect(q10Factor(25, 2, 25)).toBe(1);
  });

  it('multiplies by the coefficient per ten degrees, either way', () => {
    expect(q10Factor(35, 2, 25)).toBeCloseTo(2, 12);
    expect(q10Factor(15, 2, 25)).toBeCloseTo(0.5, 12);
    expect(q10Factor(45, 3, 25)).toBeCloseTo(9, 12);
  });
});

describe('arrheniusFactor', () => {
  it('leaves a rate alone at 20 °C', () => {
    expect(arrheniusFactor(20, 8000)).toBe(1);
  });

  it('runs ln of the factor linear in 1/T, at a slope of minus the Arrhenius temperature', () => {
    const TA = 8000;
    const reciprocal = (celsius: number): number => 1 / (celsius + 273.15);
    for (const [a, b] of [
      [5, 15],
      [15, 30],
      [22, 38],
    ]) {
      const rise = Math.log(arrheniusFactor(b, TA)) - Math.log(arrheniusFactor(a, TA));
      expect(rise / (reciprocal(b) - reciprocal(a))).toBeCloseTo(-TA, 6);
    }
  });
});

describe('hourlyDraws', () => {
  it('draws a lone rate as hourlyDraw does', () => {
    for (const rate of [0.01, 0.7, 12]) {
      expect(hourlyDraws([rate])[0]).toBeCloseTo(hourlyDraw(rate), 15);
    }
  });

  it('gives a rate of nothing no share, and nothing to anything when every rate is nothing', () => {
    expect(hourlyDraws([0.3, 0, 0.2])[1]).toBe(0);
    expect(hourlyDraws([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('takes together what their summed rate takes, split in proportion to each', () => {
    const rates = [0.05, 0.4, 2];
    const shares = hourlyDraws(rates);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(hourlyDraw(rates.reduce((a, b) => a + b, 0)), 15);
    expect(shares[2] / shares[0]).toBeCloseTo(rates[2] / rates[0], 12);
  });
});

describe('hourlyInflowDraw', () => {
  const finely = (stock: number, inflow: number, rate: number, steps = 100_000): number => {
    let held = stock;
    let drawn = 0;
    for (let i = 0; i < steps; i++) {
      const draw = held * hourlyDraw(rate / steps);
      held += inflow / steps - draw;
      drawn += draw;
    }
    return drawn;
  };

  it('draws, with the stock it starts on, what the hour drawn finely draws of a stock fed steadily', () => {
    const agrees = [0.05, 1, 12].every((rate) => {
      const drawn = 3 * hourlyDraw(rate) + 2 * hourlyInflowDraw(rate);
      return Math.abs(drawn - finely(3, 2, rate)) <= 1e-4 * drawn;
    });
    expect(agrees).toBe(true);
  });

  it('takes less of an inflow than of a stock, nothing at no rate, and nearly all at a fast one', () => {
    expect([0.01, 1, 30].every((rate) => hourlyInflowDraw(rate) < hourlyDraw(rate))).toBe(true);
    expect(hourlyInflowDraw(0)).toBe(0);
    expect(hourlyInflowDraw(1e4)).toBeCloseTo(1, 3);
  });
});

describe('meanOfExp', () => {
  it('averages e^{xt} over the unit interval, growing or decaying, and reads 1 where nothing changes', () => {
    const midpoints = (x: number, steps = 10_000): number =>
      Array.from({ length: steps }, (_, i) => Math.exp((x * (i + 0.5)) / steps)).reduce((a, b) => a + b) / steps;
    expect([-3, -0.2, 0.4, 5].every((x) => Math.abs(meanOfExp(x) / midpoints(x) - 1) < 1e-7)).toBe(true);
    expect(meanOfExp(0)).toBe(1);
    expect(meanOfExp(1e-9)).toBeCloseTo(1, 8);
  });
});

describe('monodFactor', () => {
  it('runs at half rate at the half-saturation constant', () => {
    for (const k of [0.2, 0.5, 1, 1.1]) {
      expect(monodFactor(k, k)).toBeCloseTo(0.5, 12);
    }
  });

  it('gives nothing at all with no substrate, and never less', () => {
    expect(monodFactor(0, 0.5)).toBe(0);
    expect(monodFactor(-1, 0.5)).toBe(0);
    expect(monodFactor(0, 0)).toBe(0);
  });

  it('stays inside zero and one, and climbs with the substrate', () => {
    let previous = 0;
    for (const concentration of [0.01, 0.1, 0.5, 1, 4, 8, 100, 1e6]) {
      const factor = monodFactor(concentration, 0.5);
      expect(factor).toBeGreaterThan(previous);
      expect(factor).toBeLessThan(1);
      previous = factor;
    }
  });

  it('approaches the full rate as the substrate outruns the constant', () => {
    expect(monodFactor(1e9, 0.5)).toBeCloseTo(1, 8);
  });

  it('holds a rate back harder the fussier the process is about its substrate', () => {
    expect(monodFactor(2, 1.1)).toBeLessThan(monodFactor(2, 0.3));
  });

  it('never limits anything at a half-saturation of nothing', () => {
    expect(monodFactor(0.001, 0)).toBe(1);
  });
});

describe('monodUptake', () => {
  it('draws the curve at the stock it leaves behind', () => {
    for (const [stock, capacity, k] of [
      [1, 0.2, 0.5],
      [10, 3, 0.5],
      [0.01, 50, 2],
    ]) {
      const uptake = monodUptake(stock, capacity, k);
      expect(uptake).toBeCloseTo(capacity * monodFactor(stock - uptake, k), 12);
    }
  });

  it('never overdraws the stock or the capacity', () => {
    for (const capacity of [0.01, 1, 100, 1e6]) {
      const uptake = monodUptake(1, capacity, 0.5);
      expect(uptake).toBeLessThan(1);
      expect(uptake).toBeLessThan(capacity);
    }
  });

  it('is the lesser of stock and capacity once the half-saturation is gone', () => {
    expect(monodUptake(3, 1, 0)).toBeCloseTo(1, 12);
    expect(monodUptake(1, 3, 0)).toBeCloseTo(1, 12);
  });

  it('never overdraws with a vanishing half-saturation, even when stock meets capacity', () => {
    for (const k of [0, 1e-300, 1e-12]) {
      for (const amount of [1e-9, 0.1, 0.3, 7, 1e9]) {
        const uptake = monodUptake(amount, amount, k);
        expect(Number.isFinite(uptake)).toBe(true);
        expect(uptake).toBeLessThanOrEqual(amount);
      }
    }
  });

  it('draws nothing from an empty stock or with no capacity', () => {
    expect(monodUptake(0, 1, 0.5)).toBe(0);
    expect(monodUptake(1, 0, 0.5)).toBe(0);
  });
});

describe('stockLeft', () => {
  const monod = (capacity: number, k: number) => (left: number): number => capacity * monodFactor(left, k);

  it('leaves what monodUptake leaves of a stock one Monod consumer draws on', () => {
    for (const [stock, capacity, k] of [
      [1, 0.2, 0.5],
      [10, 3, 0.5],
      [0.01, 50, 2],
    ]) {
      expect(stock - stockLeft(stock, monod(capacity, k))).toBeCloseTo(monodUptake(stock, capacity, k), 10);
    }
  });

  it('settles where the stock less what every consumer draws there is what is left', () => {
    const draws = [monod(4, 0.2), monod(9, 1.1), (left: number): number => 0.3 * left];
    const draw = (left: number): number => draws.reduce((total, d) => total + d(left), 0);
    const left = stockLeft(8, draw);
    expect(left).toBeGreaterThan(0);
    expect(left + draw(left)).toBeCloseTo(8, 9);
  });

  it('never lets the consumers draw past the stock, however hungry they are', () => {
    for (const capacity of [0.1, 10, 1e6]) {
      const draw = monod(capacity, 0.3);
      const left = stockLeft(2, draw);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(draw(left)).toBeLessThanOrEqual(2 - left);
    }
  });

  it('leaves an empty stock empty', () => {
    expect(stockLeft(0, monod(5, 0.2))).toBe(0);
  });
});

describe('lightSaturationFactor', () => {
  const IK = 20;

  it('gives nothing in the dark, and never less', () => {
    expect(lightSaturationFactor(0, IK)).toBe(0);
    expect(lightSaturationFactor(-30, IK)).toBe(0);
  });

  it('runs at 76 % of full rate at the irradiance it saturates at', () => {
    for (const ik of [8, 20, 60, 150]) {
      expect(lightSaturationFactor(ik, ik)).toBeCloseTo(0.7616, 4);
    }
  });

  it('has all but finished by twice that, and is inside a percent by three times', () => {
    expect(lightSaturationFactor(2 * IK, IK)).toBeCloseTo(0.964, 3);
    expect(lightSaturationFactor(3 * IK, IK)).toBeCloseTo(0.995, 3);
  });

  it('stays inside zero and one, and climbs with the light', () => {
    let previous = 0;
    for (const par of [0.5, 2, 8, 20, 45, 90, 200, 1e4]) {
      const factor = lightSaturationFactor(par, IK);
      expect(factor).toBeGreaterThan(previous);
      expect(factor).toBeLessThanOrEqual(1);
      previous = factor;
    }
  });

  it('flattens, so the same extra light buys less the brighter it already is', () => {
    const gain = (from: number): number =>
      lightSaturationFactor(from + IK, IK) - lightSaturationFactor(from, IK);

    expect(gain(0)).toBeGreaterThan(gain(IK));
    expect(gain(IK)).toBeGreaterThan(gain(2 * IK));
  });

  it('answers more light for longer the higher a species saturates', () => {
    expect(lightSaturationFactor(60, 60)).toBeLessThan(lightSaturationFactor(60, 16));
  });

  it('never limits anything at a saturating irradiance of nothing', () => {
    expect(lightSaturationFactor(0.001, 0)).toBe(1);
    expect(lightSaturationFactor(200, -5)).toBe(1);
  });
});
