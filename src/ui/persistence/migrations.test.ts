/**
 * Unit tests for persistence migrations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  migrateState,
  migrateLegacyKeys,
  removeLegacyKeys,
  hasLegacyKeys,
  isPlainObject,
} from './migrations.js';
import { PERSISTENCE_SCHEMA_VERSION, LEGACY_KEYS } from './types.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

describe('migrations', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  describe('migrateState', () => {
    it('returns data unchanged for current version', () => {
      const data = { test: 'data' };
      const result = migrateState(data, PERSISTENCE_SCHEMA_VERSION);
      expect(result).toBe(data);
    });

    it('returns null for unknown future version', () => {
      const data = { test: 'data' };
      const result = migrateState(data, 999);
      expect(result).toBeNull();
    });

    it('returns null for version 0', () => {
      const data = { test: 'data' };
      const result = migrateState(data, 0);
      expect(result).toBeNull();
    });
  });

  describe('migrateLegacyKeys', () => {
    it('returns null values when no legacy keys exist', () => {
      const result = migrateLegacyKeys();
      expect(result.tunableConfig).toBeNull();
      expect(result.ui).toBeNull();
    });

    it('migrates tunable config from legacy key', () => {
      const legacyConfig = {
        version: 1,
        config: DEFAULT_CONFIG,
      };
      globalThis.localStorage.setItem(LEGACY_KEYS.tunableConfig, JSON.stringify(legacyConfig));

      const result = migrateLegacyKeys();
      expect(result.tunableConfig).not.toBeNull();
      expect(result.tunableConfig?.decay).toBeDefined();
    });

    it('migrates units preference from legacy key', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'imperial');

      const result = migrateLegacyKeys();
      expect(result.ui).not.toBeNull();
      expect(result.ui?.units).toBe('imperial');
    });

    it('migrates debug panel state from legacy key', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.debugPanel, 'true');

      const result = migrateLegacyKeys();
      expect(result.ui).not.toBeNull();
      expect(result.ui?.debugPanelOpen).toBe(true);
    });

    it('combines units and debug panel into ui object', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');
      globalThis.localStorage.setItem(LEGACY_KEYS.debugPanel, 'true');

      const result = migrateLegacyKeys();
      expect(result.ui?.units).toBe('metric');
      expect(result.ui?.debugPanelOpen).toBe(true);
    });

    it('handles invalid JSON in legacy config gracefully', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.tunableConfig, 'not valid json');

      const result = migrateLegacyKeys();
      expect(result.tunableConfig).toBeNull();
    });

    it('handles config without expected structure gracefully', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.tunableConfig, JSON.stringify({ wrong: 'format' }));

      const result = migrateLegacyKeys();
      expect(result.tunableConfig).toBeNull();
    });
  });

  describe('removeLegacyKeys', () => {
    it('removes all legacy keys', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.tunableConfig, 'test');
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');
      globalThis.localStorage.setItem(LEGACY_KEYS.debugPanel, 'false');

      removeLegacyKeys();

      expect(globalThis.localStorage.getItem(LEGACY_KEYS.tunableConfig)).toBeNull();
      expect(globalThis.localStorage.getItem(LEGACY_KEYS.units)).toBeNull();
      expect(globalThis.localStorage.getItem(LEGACY_KEYS.debugPanel)).toBeNull();
    });

    it('does not throw when keys do not exist', () => {
      expect(() => removeLegacyKeys()).not.toThrow();
    });
  });

  describe('hasLegacyKeys', () => {
    it('returns false when no legacy keys exist', () => {
      expect(hasLegacyKeys()).toBe(false);
    });

    it('returns true when tunable config key exists', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.tunableConfig, 'test');
      expect(hasLegacyKeys()).toBe(true);
    });

    it('returns true when units key exists', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.units, 'metric');
      expect(hasLegacyKeys()).toBe(true);
    });

    it('returns true when debug panel key exists', () => {
      globalThis.localStorage.setItem(LEGACY_KEYS.debugPanel, 'true');
      expect(hasLegacyKeys()).toBe(true);
    });
  });

  describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ key: 'value' })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });
  });
});
