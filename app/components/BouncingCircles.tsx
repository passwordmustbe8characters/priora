"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { QUOTES } from "../lib/quotes";

const CIRCLE_COUNT = 16;
const MAX_SPEED = 0.5; // px/frame — "excited but not too fast"
const EDGE_MARGIN = 6;
const KEEPOUT_LERP = 0.06; // how fast the keepout zone eases toward its target size

// useLayoutEffect warns during SSR; this component is purely decorative
// and client-only, so fall back to useEffect there rather than guard
// every call site.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface CircleBody {
  id: number;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hovered: boolean;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * `expanded` grows the center keepout zone (eased, not instant) — used
 * when the search card morphs into its results-preview size, so nearby
 * circles get physically pushed out of its way via the same AABB
 * collision the keepout always used, just with a bigger target.
 */
export function BouncingCircles({ expanded = false }: { expanded?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<CircleBody[]>([]);
  const elRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sizeRef = useRef({ width: 0, height: 0 });
  const keepoutRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const expandedRef = useRef(expanded);
  const reducedMotionRef = useRef(false);
  const readyRef = useRef(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  // Radius is seeded once and never changes after — it's safe (and,
  // unlike bodiesRef, necessary) to read during render for sizing, so it
  // lives in state rather than the fast-mutating physics ref. Reading a
  // ref's .current during render is exactly what react-hooks/refs flags,
  // and rightly so here — bodiesRef changes every animation frame.
  const [radii, setRadii] = useState<number[]>([]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  function keepoutTarget() {
    const { width, height } = sizeRef.current;
    return expandedRef.current
      ? { w: Math.min(820, width * 0.86), h: Math.min(600, height * 0.72) }
      : { w: Math.min(680, width * 0.72), h: Math.min(360, height * 0.52) };
  }

  // Measure the container and (re)seed circle bodies. Runs before paint so
  // there's no visible jump from an initial 0,0 position.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function isInsideKeepout(x: number, y: number, r: number) {
      const k = keepoutRef.current;
      return x + r > k.x && x - r < k.x + k.w && y + r > k.y && y - r < k.y + k.h;
    }

    function measure() {
      const rect = container!.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      const target = keepoutTarget();
      keepoutRef.current = {
        x: rect.width / 2 - target.w / 2,
        y: rect.height / 2 - target.h / 2,
        w: target.w,
        h: target.h,
      };
    }
    measure();

    if (bodiesRef.current.length === 0) {
      const { width } = sizeRef.current;
      const small = width < 520;
      const minR = small ? 18 : 26;
      const maxR = small ? 42 : 70;

      const bodies: CircleBody[] = Array.from({ length: CIRCLE_COUNT }, (_, id) => {
        const radius = rand(minR, maxR);
        let x = 0;
        let y = 0;
        let tries = 0;
        do {
          x = rand(radius + EDGE_MARGIN, sizeRef.current.width - radius - EDGE_MARGIN);
          y = rand(radius + EDGE_MARGIN, sizeRef.current.height - radius - EDGE_MARGIN);
          tries++;
        } while (isInsideKeepout(x, y, radius) && tries < 40);
        const angle = rand(0, Math.PI * 2);
        const speed = rand(MAX_SPEED * 0.4, MAX_SPEED);
        return { id, radius, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, hovered: false };
      });
      bodiesRef.current = bodies;
      setRadii(bodies.map((b) => b.radius));
    }

    readyRef.current = true;
    setReady(true);

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Animation loop — positions are applied via direct DOM mutation
  // (el.style.transform), not React state, so 16 bouncing bodies don't
  // trigger a re-render every frame.
  useEffect(() => {
    let rafId: number;

    function isInsideKeepout(x: number, y: number, r: number) {
      const k = keepoutRef.current;
      return x + r > k.x && x - r < k.x + k.w && y + r > k.y && y - r < k.y + k.h;
    }

    function tick() {
      const bodies = bodiesRef.current;
      const { width, height } = sizeRef.current;

      // Ease the keepout zone toward whatever size it should currently be
      // — this is what makes nearby circles get pushed away smoothly as
      // the search card grows, using the exact same collision code below.
      const target = keepoutTarget();
      const k = keepoutRef.current;
      k.w += (target.w - k.w) * KEEPOUT_LERP;
      k.h += (target.h - k.h) * KEEPOUT_LERP;
      k.x = width / 2 - k.w / 2;
      k.y = height / 2 - k.h / 2;

      if (readyRef.current && !reducedMotionRef.current) {
        for (const b of bodies) {
          if (b.hovered) continue;
          b.x += b.vx;
          b.y += b.vy;

          if (b.x - b.radius < 0) {
            b.x = b.radius;
            b.vx = Math.abs(b.vx);
          }
          if (b.x + b.radius > width) {
            b.x = width - b.radius;
            b.vx = -Math.abs(b.vx);
          }
          if (b.y - b.radius < 0) {
            b.y = b.radius;
            b.vy = Math.abs(b.vy);
          }
          if (b.y + b.radius > height) {
            b.y = height - b.radius;
            b.vy = -Math.abs(b.vy);
          }

          if (isInsideKeepout(b.x, b.y, b.radius)) {
            const overlapLeft = b.x + b.radius - k.x;
            const overlapRight = k.x + k.w - (b.x - b.radius);
            const overlapTop = b.y + b.radius - k.y;
            const overlapBottom = k.y + k.h - (b.y - b.radius);
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
            if (minOverlap === overlapLeft) {
              b.x = k.x - b.radius;
              b.vx = -Math.abs(b.vx);
            } else if (minOverlap === overlapRight) {
              b.x = k.x + k.w + b.radius;
              b.vx = Math.abs(b.vx);
            } else if (minOverlap === overlapTop) {
              b.y = k.y - b.radius;
              b.vy = -Math.abs(b.vy);
            } else {
              b.y = k.y + k.h + b.radius;
              b.vy = Math.abs(b.vy);
            }
          }
        }

        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i];
            const b = bodies[j];
            // A hovered (enlarged) circle uses its real current on-screen
            // radius for collision — it's still an actual circle, just a
            // bigger one, so no shape approximation needed.
            const ra = a.hovered ? HOVER_RADIUS : a.radius;
            const rb = b.hovered ? HOVER_RADIUS : b.radius;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const minDist = ra + rb;
            if (dist >= minDist) continue;

            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            if (a.hovered && !b.hovered) {
              b.x += nx * overlap;
              b.y += ny * overlap;
              const vn = b.vx * nx + b.vy * ny;
              b.vx -= 2 * vn * nx;
              b.vy -= 2 * vn * ny;
            } else if (b.hovered && !a.hovered) {
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              const vn = a.vx * nx + a.vy * ny;
              a.vx -= 2 * vn * nx;
              a.vy -= 2 * vn * ny;
            } else if (!a.hovered && !b.hovered) {
              a.x -= (nx * overlap) / 2;
              a.y -= (ny * overlap) / 2;
              b.x += (nx * overlap) / 2;
              b.y += (ny * overlap) / 2;
              const van = a.vx * nx + a.vy * ny;
              const vbn = b.vx * nx + b.vy * ny;
              a.vx += (vbn - van) * nx;
              a.vy += (vbn - van) * ny;
              b.vx += (van - vbn) * nx;
              b.vy += (van - vbn) * ny;
            }
          }
        }
      }

      for (const b of bodies) {
        const el = elRefs.current[b.id];
        if (el && !b.hovered) {
          el.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleEnter = (id: number) => {
    setHoveredId(id);
    const b = bodiesRef.current.find((c) => c.id === id);
    if (b) b.hovered = true;
  };

  const handleLeave = (id: number) => {
    setHoveredId(null);
    const b = bodiesRef.current.find((c) => c.id === id);
    if (b) b.hovered = false;
  };

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden
    >
      {Array.from({ length: CIRCLE_COUNT }, (_, id) => {
        const quote = QUOTES[id % QUOTES.length];
        const hovered = hoveredId === id;
        const diameter = radii[id] ? radii[id] * 2 : 0;

        return (
          <div
            key={id}
            ref={(el) => {
              elRefs.current[id] = el;
            }}
            onMouseEnter={() => handleEnter(id)}
            onMouseLeave={() => handleLeave(id)}
            className={`pointer-events-auto absolute top-0 left-0 flex aspect-square cursor-pointer items-center justify-center rounded-full bg-foreground shadow-lg transition-[width,height,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              hovered ? "z-20 w-64 p-8 sm:w-80 sm:p-10" : "z-10 overflow-hidden"
            }`}
            style={hovered ? undefined : { width: diameter, height: diameter }}
          >
            <div
              className={`text-center transition-opacity duration-300 ${
                hovered ? "opacity-100 delay-150" : "pointer-events-none h-0 w-0 opacity-0"
              }`}
            >
              <p className="font-body line-clamp-6 text-xs text-background/90 sm:text-sm">
                &ldquo;{quote.text}&rdquo;
              </p>
              <p className="font-body mt-3 text-[10px] text-background/50 sm:text-xs">{quote.author}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Matches the hovered box's actual rendered radius (w-80/2 = 160px at the
// sm+ breakpoint) closely enough for collision purposes — it only needs
// to be in the right neighborhood, not pixel-exact.
const HOVER_RADIUS = 150;
