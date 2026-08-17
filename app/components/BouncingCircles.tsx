"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { QUOTES } from "../lib/quotes";

const MAX_SPEED = 0.5; // px/frame — "excited but not too fast"
const EDGE_MARGIN = 6;
// Approximate half-diagonal of the morphed card — used only for collision
// math so other circles physically get pushed away from roughly the
// rectangle's footprint, not just its original circular one.
const MORPH_AVOIDANCE_RADIUS = 200;

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
  morphed: boolean;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function BouncingCircles() {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<CircleBody[]>([]);
  const elRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sizeRef = useRef({ width: 0, height: 0 });
  const keepoutRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
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
      const kw = Math.min(680, rect.width * 0.72);
      const kh = Math.min(360, rect.height * 0.52);
      keepoutRef.current = {
        x: rect.width / 2 - kw / 2,
        y: rect.height / 2 - kh / 2,
        w: kw,
        h: kh,
      };
    }
    measure();

    if (bodiesRef.current.length === 0) {
      const { width } = sizeRef.current;
      const small = width < 520;
      const minR = small ? 16 : 24;
      const maxR = small ? 32 : 50;

      const bodies: CircleBody[] = QUOTES.map((_, id) => {
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
        return { id, radius, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, morphed: false };
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
  // (el.style.transform), not React state, so 10 bouncing bodies don't
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

      if (readyRef.current && !reducedMotionRef.current) {
        for (const b of bodies) {
          if (b.morphed) continue;
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
            const k = keepoutRef.current;
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
            const ra = a.morphed ? MORPH_AVOIDANCE_RADIUS : a.radius;
            const rb = b.morphed ? MORPH_AVOIDANCE_RADIUS : b.radius;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const minDist = ra + rb;
            if (dist >= minDist) continue;

            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            if (a.morphed && !b.morphed) {
              b.x += nx * overlap;
              b.y += ny * overlap;
              const vn = b.vx * nx + b.vy * ny;
              b.vx -= 2 * vn * nx;
              b.vy -= 2 * vn * ny;
            } else if (b.morphed && !a.morphed) {
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              const vn = a.vx * nx + a.vy * ny;
              a.vx -= 2 * vn * nx;
              a.vy -= 2 * vn * ny;
            } else if (!a.morphed && !b.morphed) {
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
        if (el && !b.morphed) {
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
    if (b) b.morphed = true;
  };

  const handleLeave = (id: number) => {
    setHoveredId(null);
    const b = bodiesRef.current.find((c) => c.id === id);
    if (b) b.morphed = false;
  };

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden
    >
      {QUOTES.map((quote, id) => {
        const morphed = hoveredId === id;
        const diameter = radii[id] ? radii[id] * 2 : 0;

        return (
          <div
            key={id}
            ref={(el) => {
              elRefs.current[id] = el;
            }}
            onMouseEnter={() => handleEnter(id)}
            onMouseLeave={() => handleLeave(id)}
            className={`pointer-events-auto absolute top-0 left-0 flex cursor-pointer items-center justify-center bg-black shadow-lg ring-1 ring-white/10 transition-[width,height,border-radius,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              morphed
                ? "z-20 max-h-80 w-72 overflow-y-auto rounded-3xl p-5 sm:w-96"
                : "z-10 overflow-hidden rounded-full"
            }`}
            style={morphed ? undefined : { width: diameter, height: diameter }}
          >
            <div
              className={`text-center transition-opacity duration-300 ${
                morphed ? "opacity-100 delay-150" : "pointer-events-none h-0 w-0 opacity-0"
              }`}
            >
              <p className="font-body text-sm text-white/90 sm:text-base">&ldquo;{quote.text}&rdquo;</p>
              <p className="font-body mt-3 text-xs text-white/50">{quote.author}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
