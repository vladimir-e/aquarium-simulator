import type { SimulationState, PlantSpecies, FishSpecies } from '../state.js';
import type { WaterChangeAmount } from './water-change.js';

/** Valid target sizes for trimming (percentages) */
export type TrimTargetSize = 50 | 85 | 100;

export type ActionType =
  | 'topOff'
  | 'feed'
  | 'scrubAlgae'
  | 'waterChange'
  | 'trimPlants'
  | 'addPlant'
  | 'removePlant'
  | 'dose'
  | 'addFish'
  | 'removeFish';

export interface BaseAction {
  type: ActionType;
}

export interface TopOffAction extends BaseAction {
  type: 'topOff';
  // No parameters - always fills to capacity
}

export interface FeedAction extends BaseAction {
  type: 'feed';
  /** Amount of food to add in grams */
  amount: number;
}

export interface ScrubAlgaeAction extends BaseAction {
  type: 'scrubAlgae';
  /** Optional: deterministic percentage for testing (0.1-0.3) */
  randomPercent?: number;
}

export interface WaterChangeAction extends BaseAction {
  type: 'waterChange';
  /** Fraction of water to change (0.1, 0.25, 0.5, 0.9) */
  amount: WaterChangeAmount;
}

export interface TrimPlantsAction extends BaseAction {
  type: 'trimPlants';
  /** Target size to trim plants down to (%) */
  targetSize: TrimTargetSize;
}

export interface AddPlantAction extends BaseAction {
  type: 'addPlant';
  /** Species of plant to add */
  species: PlantSpecies;
  /** Initial size percentage (default 50%) */
  initialSize?: number;
}

export interface RemovePlantAction extends BaseAction {
  type: 'removePlant';
  /** ID of the plant to remove */
  plantId: string;
}

export interface DoseAction extends BaseAction {
  type: 'dose';
  /** Amount of fertilizer to add in ml */
  amountMl: number;
}

export interface AddFishAction extends BaseAction {
  type: 'addFish';
  /** Species of fish to add */
  species: FishSpecies;
}

export interface RemoveFishAction extends BaseAction {
  type: 'removeFish';
  /** ID of the fish to remove */
  fishId: string;
}

export type Action =
  | TopOffAction
  | FeedAction
  | ScrubAlgaeAction
  | WaterChangeAction
  | TrimPlantsAction
  | AddPlantAction
  | RemovePlantAction
  | DoseAction
  | AddFishAction
  | RemoveFishAction;

/**
 * Result of applying an action to simulation state.
 */
export interface ActionResult {
  /** Updated simulation state */
  state: SimulationState;
  /** Human-readable message describing what happened */
  message: string;
}
