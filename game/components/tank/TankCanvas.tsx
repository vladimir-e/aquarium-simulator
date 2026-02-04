import { useEffect, useRef, useState } from 'react';
import { Application, Graphics, Container } from 'pixi.js';

/**
 * Layer indices for sprite rendering order
 * (exported for future use when adding fish, plants, etc.)
 */
export const LAYERS = {
  background: 0, // Substrate, back plants
  midground: 1, // Hardscape, mid plants
  fish: 2, // Swimming fish
  foreground: 3, // Front plants, bubbles
  surface: 4, // Water line, floating plants
} as const;

/**
 * Water gradient colors
 */
const WATER_COLORS = {
  surface: 0x7dd3fc, // Light cyan at top
  mid: 0x38bdf8, // Sky blue
  deep: 0x0284c7, // Darker blue at bottom
  floor: 0x075985, // Deepest blue for substrate area
};

/**
 * TankCanvas - Pixi.js canvas wrapper for tank visualization
 *
 * Features:
 * - Responsive sizing (fills container)
 * - Water gradient background (light blue top to darker blue bottom)
 * - Subtle water surface line
 * - Layer containers ready for sprites
 */
function TankCanvas(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let initComplete = false;

    const initPixi = async (): Promise<void> => {
      // Create Pixi application
      const app = new Application();

      try {
        await app.init({
          background: WATER_COLORS.deep,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        // Check if component unmounted during async init
        if (!mounted) {
          app.destroy(true);
          return;
        }

        appRef.current = app;

        // Add canvas to DOM
        container.appendChild(app.canvas);

        // Resize to container
        app.renderer.resize(container.clientWidth, container.clientHeight);

        // Create layer containers for future sprite management
        const layers = new Container();
        layers.label = 'layers';

        Object.keys(LAYERS).forEach((layerName) => {
          const layerContainer = new Container();
          layerContainer.label = layerName;
          layers.addChild(layerContainer);
        });

        app.stage.addChild(layers);

        // Draw water gradient background
        const drawBackground = (): void => {
          if (!appRef.current) return;

          // Remove existing background if any
          const existingBg = appRef.current.stage.getChildByLabel('waterBackground');
          if (existingBg) {
            appRef.current.stage.removeChild(existingBg);
          }

          const graphics = new Graphics();
          graphics.label = 'waterBackground';

          const width = appRef.current.screen.width;
          const height = appRef.current.screen.height;

          // Draw gradient using multiple horizontal stripes
          const stripes = 20;
          const stripeHeight = height / stripes;

          for (let i = 0; i < stripes; i++) {
            const progress = i / (stripes - 1);
            const color = interpolateColor(
              progress < 0.3
                ? WATER_COLORS.surface
                : progress < 0.7
                  ? WATER_COLORS.mid
                  : WATER_COLORS.deep,
              progress < 0.3
                ? WATER_COLORS.mid
                : progress < 0.7
                  ? WATER_COLORS.deep
                  : WATER_COLORS.floor,
              progress < 0.3
                ? progress / 0.3
                : progress < 0.7
                  ? (progress - 0.3) / 0.4
                  : (progress - 0.7) / 0.3
            );

            graphics.rect(0, i * stripeHeight, width, stripeHeight + 1);
            graphics.fill({ color });
          }

          // Draw subtle water surface line
          graphics.rect(0, 0, width, 3);
          graphics.fill({ color: 0xbae6fd, alpha: 0.6 });

          // Add to stage behind layers
          appRef.current.stage.addChildAt(graphics, 0);
        };

        drawBackground();

        // Handle resize
        resizeObserver = new ResizeObserver(() => {
          if (appRef.current && mounted) {
            appRef.current.renderer.resize(container.clientWidth, container.clientHeight);
            drawBackground();
          }
        });
        resizeObserver.observe(container);

        initComplete = true;
        setIsReady(true);
      } catch {
        // Cleanup on error - only destroy if renderer was initialized
        if (app.renderer) {
          app.destroy(true);
        }
      }
    };

    initPixi();

    // Cleanup
    return (): void => {
      mounted = false;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (initComplete && appRef.current) {
        // Remove canvas from DOM first
        if (appRef.current.canvas.parentNode) {
          appRef.current.canvas.parentNode.removeChild(appRef.current.canvas);
        }
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-xl border-4 border-[--color-border-medium] bg-[--color-water-deep]"
      aria-label="Aquarium tank visualization"
      role="img"
    >
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[--color-text-muted]">Loading tank...</span>
        </div>
      )}
    </div>
  );
}

/**
 * Interpolate between two colors
 */
function interpolateColor(color1: number, color2: number, factor: number): number {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);

  return (r << 16) | (g << 8) | b;
}

export default TankCanvas;
