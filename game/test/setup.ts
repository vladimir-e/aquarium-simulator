import { vi } from 'vitest';

// Mock Pixi.js globally for all tests
vi.mock('pixi.js', () => {
  const noop = (): void => {};

  return {
    Application: class MockApplication {
      canvas = document.createElement('canvas');
      stage = {
        addChild: noop,
        addChildAt: noop,
        getChildByLabel: (): null => null,
        removeChild: noop,
      };
      screen = { width: 800, height: 600 };
      renderer = { resize: noop };
      init(): Promise<void> {
        return Promise.resolve();
      }
      resize = noop;
      destroy = noop;
    },
    Graphics: class MockGraphics {
      label = '';
      rect(): this {
        return this;
      }
      fill(): this {
        return this;
      }
    },
    Container: class MockContainer {
      label = '';
      addChild = noop;
    },
  };
});

// Mock ResizeObserver globally with a proper class
global.ResizeObserver = class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
