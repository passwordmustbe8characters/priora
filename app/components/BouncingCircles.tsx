"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { QUOTES } from "../lib/quotes";

const CIRCLE_COUNT = 50; // rendered DOM element count — constant across SSR/client, see the mobile-count note below
const MOBILE_CIRCLE_COUNT = 22; // meaningfully fewer on small screens — 40 read as too crowded on an actual phone
const MAX_SPEED = 0.5; // px/frame — "excited but not too fast"
const MAX_TILT_SPEED = MAX_SPEED * 3; // velocity cap while device-tilt is actively pushing bodies around
const TILT_FORCE = 0.01; // px/frame² per full-tilt (±90°) — tuned to feel responsive without being twitchy
const EDGE_MARGIN = 6;
const TOP_MARGIN_DESKTOP = 96; // clears the fixed header (logo + theme toggle) with room to spare
const TOP_MARGIN_MOBILE = 108; // header content is proportionally taller relative to a small viewport
const KEEPOUT_LERP = 0.06; // how fast the keepout zone eases toward its target size
const HOVER_LERP = 0.1; // how fast a circle's "hover amount" eases toward 0 or 1 — roughly matches the 500ms CSS grow/shrink so physics and visuals stay in sync
const HOVER_EPS = 0.01; // below this, treat hover amount as settled (snap to the resting value)

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
  // Eased 0→1 "how hovered" amount — separate from the `hovered` flag so
  // growing AND shrinking both ease smoothly instead of snapping. A body
  // is positionally frozen (no velocity, no transform updates, treated
  // as immovable by neighbors) whenever this is above ~0: that covers
  // the whole grow phase, the hovered hold, and the shrink-back tail, so
  // it never jump-resumes mid-shrink.
  hoverT: number;
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
  // beta = front/back tilt (-180..180), gamma = left/right tilt (-90..90).
  // Stays {0,0} — a harmless no-op — on any device/browser that never
  // fires deviceorientation (most desktops), so this needs no separate
  // touch/desktop branch of its own.
  const tiltRef = useRef({ beta: 0, gamma: 0 });
  // How close a circle's center may get to y=0 before bouncing back down
  // — keeps every circle (not just newly-seeded ones) clear of the
  // fixed header, rather than just avoiding it at spawn time. Set once
  // seeding determines desktop vs. mobile sizing.
  const topMarginRef = useRef(TOP_MARGIN_DESKTOP);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  // Radius is seeded once and never changes after — it's safe (and,
  // unlike bodiesRef, necessary) to read during render for sizing, so it
  // lives in state rather than the fast-mutating physics ref. Reading a
  // ref's .current during render is exactly what react-hooks/refs flags,
  // and rightly so here — bodiesRef changes every animation frame.
  //
  // Mobile gets fewer *visible* circles, but the DOM element count
  // (CIRCLE_COUNT, used below in the render loop) stays fixed across
  // SSR and client to avoid a hydration mismatch — ids beyond the
  // screen-appropriate count just seed with radius 0 and sit parked
  // off-screen, invisible and inert, rather than not being rendered at
  // all.
  const [radii, setRadii] = useState<number[]>([]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  function keepoutTarget() {
    const { width, height } = sizeRef.current;
    // The resting (non-expanded) zone only needs to clear the search
    // pill itself, not a generous halo around it — too big and it reads
    // as an obvious empty gap in the middle of the screen.
    return expandedRef.current
      ? { w: Math.min(820, width * 0.86), h: Math.min(600, height * 0.72) }
      : { w: Math.min(520, width * 0.56), h: Math.min(260, height * 0.36) };
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
      const activeCount = small ? MOBILE_CIRCLE_COUNT : CIRCLE_COUNT;
      const topMargin = small ? TOP_MARGIN_MOBILE : TOP_MARGIN_DESKTOP;
      topMarginRef.current = topMargin;

      const bodies: CircleBody[] = Array.from({ length: CIRCLE_COUNT }, (_, id) => {
        if (id >= activeCount) {
          // Parked: zero size, off-screen, zero velocity — takes up the
          // DOM slot (for hydration-safe, constant element count) but
          // is otherwise completely inert and invisible.
          return { id, radius: 0, x: -1000, y: -1000, vx: 0, vy: 0, hovered: false, hoverT: 0 };
        }
        const radius = rand(minR, maxR);
        let x = 0;
        let y = 0;
        let tries = 0;
        do {
          x = rand(radius + EDGE_MARGIN, sizeRef.current.width - radius - EDGE_MARGIN);
          y = rand(radius + topMargin, sizeRef.current.height - radius - EDGE_MARGIN);
          tries++;
        } while (isInsideKeepout(x, y, radius) && tries < 40);
        const angle = rand(0, Math.PI * 2);
        const speed = rand(MAX_SPEED * 0.4, MAX_SPEED);
        return { id, radius, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, hovered: false, hoverT: 0 };
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

  // Device-tilt input — nudges every non-frozen body a little each frame
  // in whichever direction the phone is tilted. iOS requires an explicit
  // user gesture before it'll grant motion-sensor permission, so that
  // case waits for the first tap; everywhere else (Android, desktops
  // that happen to fire the event, or just don't at all) can listen
  // immediately since there's nothing to ask permission for.
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;

    function handleOrientation(e: DeviceOrientationEvent) {
      tiltRef.current = { beta: e.beta ?? 0, gamma: e.gamma ?? 0 };
    }

    const RequestPermission = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> }
    ).requestPermission;

    if (typeof RequestPermission === "function") {
      const onFirstGesture = () => {
        RequestPermission()
          .then((state) => {
            if (state === "granted") window.addEventListener("deviceorientation", handleOrientation);
          })
          .catch(() => {});
      };
      window.addEventListener("pointerdown", onFirstGesture, { once: true });
      return () => {
        window.removeEventListener("pointerdown", onFirstGesture);
        window.removeEventListener("deviceorientation", handleOrientation);
      };
    }

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  // Animation loop — positions are applied via direct DOM mutation
  // (el.style.transform), not React state, so 50 bouncing bodies don't
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
        // Ease each body's hover amount toward its target first, so the
        // collision pass below (which reads hoverT) sees this frame's
        // updated value — a circle that just un-hovered still counts as
        // "frozen and big" for a few frames while it eases back down.
        for (const b of bodies) {
          const hoverTarget = b.hovered ? 1 : 0;
          b.hoverT += (hoverTarget - b.hoverT) * HOVER_LERP;
          if (b.hoverT < HOVER_EPS) b.hoverT = 0;
          else if (b.hoverT > 1 - HOVER_EPS) b.hoverT = 1;
        }

        const tiltAx = (tiltRef.current.gamma / 90) * TILT_FORCE;
        const tiltAy = (tiltRef.current.beta / 90) * TILT_FORCE;

        for (const b of bodies) {
          const frozen = b.hovered || b.hoverT > 0;
          if (frozen) continue;

          if (tiltAx !== 0 || tiltAy !== 0) {
            b.vx += tiltAx;
            b.vy += tiltAy;
            const speed = Math.hypot(b.vx, b.vy);
            if (speed > MAX_TILT_SPEED) {
              b.vx = (b.vx / speed) * MAX_TILT_SPEED;
              b.vy = (b.vy / speed) * MAX_TILT_SPEED;
            }
          }

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
          if (b.y - b.radius < topMarginRef.current) {
            b.y = topMarginRef.current + b.radius;
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
            // Effective radius eases from its resting radius up to
            // HOVER_RADIUS (and back down) as hoverT eases — so the push
            // on neighbors ramps up/down smoothly instead of snapping
            // the instant a hover starts or ends.
            const ra = a.radius + (HOVER_RADIUS - a.radius) * a.hoverT;
            const rb = b.radius + (HOVER_RADIUS - b.radius) * b.hoverT;
            const aFrozen = a.hovered || a.hoverT > 0;
            const bFrozen = b.hovered || b.hoverT > 0;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const minDist = ra + rb;
            if (dist >= minDist) continue;

            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            if (aFrozen && !bFrozen) {
              b.x += nx * overlap;
              b.y += ny * overlap;
              const vn = b.vx * nx + b.vy * ny;
              b.vx -= 2 * vn * nx;
              b.vy -= 2 * vn * ny;
            } else if (bFrozen && !aFrozen) {
              a.x -= nx * overlap;
              a.y -= ny * overlap;
              const vn = a.vx * nx + a.vy * ny;
              a.vx -= 2 * vn * nx;
              a.vy -= 2 * vn * ny;
            } else if (!aFrozen && !bFrozen) {
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
            // both frozen: two hovered/settling circles overlapping is
            // vanishingly rare (keepout + spacing) and neither can move
            // anyway, so there's nothing to resolve.
          }
        }
      }

      for (const b of bodies) {
        const el = elRefs.current[b.id];
        const frozen = b.hovered || b.hoverT > 0;
        if (el && !frozen) {
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
            // Growing and shrinking use different timing functions on
            // purpose: the punchy front-loaded curve reads as a nice
            // "pop" when growing, but the exact same curve run in
            // reverse for the shrink collapses almost the whole way
            // within the first fraction of the duration and then just
            // creeps the rest — it reads as an abrupt snap, not smooth.
            // An even ease-in-out shrink fixes that without touching
            // the grow feel at all.
            className={`pointer-events-auto absolute top-0 left-0 flex aspect-square cursor-pointer items-center justify-center rounded-full bg-foreground shadow-lg transition-[width,height,padding] duration-500 ${
              hovered
                ? "z-20 w-64 p-8 ease-[cubic-bezier(0.22,1,0.36,1)] sm:w-80 sm:p-10"
                : "z-10 overflow-hidden ease-[cubic-bezier(0.4,0,0.2,1)]"
            }`}
            style={hovered ? undefined : { width: diameter, height: diameter }}
          >
            <div
              className={`text-center transition-opacity duration-300 ${
                hovered ? "opacity-100 delay-150" : "pointer-events-none h-0 w-0 opacity-0"
              }`}
            >
              <p className="font-body line-clamp-6 text-sm text-background/90 sm:text-base">
                &ldquo;{quote.text}&rdquo;
              </p>
              <p className="font-body mt-3 text-xs text-background/50 sm:text-sm">{quote.author}</p>
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
