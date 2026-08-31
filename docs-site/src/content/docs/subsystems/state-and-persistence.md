---
title: "State & persistence"
description: "The state shape, preset seeds and the serializable RNG seam."
---

`SimulationState` is a plain serializable object, and the RNG stream is part of it, so two tanks built on one seed live the same life.
