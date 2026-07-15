/**
 * Shared vitality-core tunables.
 *
 * The surplus bank is a saturating reserve buffer sitting *above* an
 * organism's condition (or, for algae, its mass). Damage drains the
 * bank before condition falls, and accrual saturates at the cap — a
 * body banks only so much reserve, like vitamin absorption. One default
 * shared by fish, plants, and algae so the three organism types start
 * from the same ceiling; each config references it and can be tuned
 * apart in a later calibration pass.
 */
export const SURPLUS_CAP_DEFAULT = 50;
