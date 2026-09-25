# The `sim` CLI

`src/cli/sim.ts` drives the engine headless. Run it with `npx tsx src/cli/sim.ts <command>`.

## Scenarios

`npm run scenarios` runs every preset tank headless on a keeper's schedule and prints its readings at days 1, 7, 30, 90 (and 300), each graded green/amber/red against a plausibility band.

```bash
npm run scenarios                                  # every setup, 90 days
npm run scenarios -- low-tech nano --days=300      # named setups, longer run
npm run scenarios -- --bands                       # print the bands and why
npm run scenarios -- low-tech --trace=30           # hourly PAR/temp/O2/CO2/pH for day 30
npm run scenarios -- --json=out.json               # machine-readable results
```

Setups: `nano`, `low-tech`, `high-tech`, `community`, `low-flow`, `cold`.

Tweaks apply to every setup in the run:

| Flag | Effect |
| --- | --- |
| `--feed=2g/1d`, `--feed=3%` | Feed grams, or a share of stocked fish mass; optional period |
| `--water-change=30%/1w` | Weekly water-change share and period |
| `--dose=2ml/1w` | Fertilizer dose |
| `--trim[=2w]`, `--scrub[=1w]`, `--top-off[=1d]` | Maintenance chores, optional period |
| `--<chore>=off` | Drop that chore from the schedule |
| `--plant=java_fern:3:40` | Add a plant group (species:count:size) |
| `--fish=neon_tetra:6` | Add a fish group (species:count) |
| `--light=1.5` | Scale fixture PAR |
| `--gal=40` | Change tank volume |
| `--uncycled` | Start without a cycled biofilter |
| `--set=path.to.tunable=value` | Override a tunable |

Periods are `<n>d` or `<n>w`.

## Interactive session

The session lives in `.simstate/current.json`; every command acts on it until a new one is created.

```bash
# Every preset but bare opens a month into its life; --no-seed starts it brand new
npx tsx src/cli/sim.ts new --preset=planted --tank-gal=10 --name=my-run [--no-seed]

npx tsx src/cli/sim.ts add plant --species=amazon_sword --size=0.5
npx tsx src/cli/sim.ts add fish --species=neon_tetra --count=6
npx tsx src/cli/sim.ts tick 5d

npx tsx src/cli/sim.ts observe
npx tsx src/cli/sim.ts trace --fields=temperature,ph,nh3_ppm,no3_ppm --every=1d

npx tsx src/cli/sim.ts action feed 0.5
npx tsx src/cli/sim.ts action waterChange 40
npx tsx src/cli/sim.ts action dose 1

npx tsx src/cli/sim.ts config get nitrogenCycle
npx tsx src/cli/sim.ts config set nitrogenCycle.bacteriaPerCm2 260

npx tsx src/cli/sim.ts smoke   # end-to-end wiring check
```

Durations accept `5d`, `48h`, or a bare integer (hours). `config set` holds a tunable to the range its `*ConfigMeta` declares; the nitrogen cycle's meta declares none, so its rates take any finite number.
