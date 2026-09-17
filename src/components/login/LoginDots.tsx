"use client";

import { useEffect, useRef } from "react";

/**
 * The ground, made to answer.
 *
 * The sign-in screen already had two background layers and both are passive:
 * three aurora masses that drift on their own cycles, and a static 4px lattice
 * over them. This is the third, and it is the only one that knows the pointer
 * is there.
 *
 * WHAT IT IS, rather than "particles". The field is a scatter of vehicles on a
 * dark map, and the cursor is a sweep passing over it. Where the sweep falls,
 * points wake: they brighten, they lean toward it, and the woken ones join to
 * their neighbours with hairlines — a network assembling itself out of a field
 * that looked empty a moment ago, and dissolving again behind you. That is
 * what this product does, so it is what the ground does.
 *
 * Deliberately NOT a second dot pattern competing with the lattice. These are
 * sparser and larger (one every ~54px against the weave's 4px) and they sit at
 * a tenth of an alpha until something wakes them, so with the pointer away the
 * layer reads as depth in the existing texture rather than as a grid of its
 * own.
 *
 * THE RULES IT KEEPS
 *
 *   Coarse pointers get a static field. There is no hover on a phone, so the
 *   whole loop would be battery spent on an effect nobody can trigger — and
 *   this screen is signed into from a yard.
 *
 *   Reduced motion keeps the response, loses the movement. The brightening is
 *   an answer to input, not an animation playing at you; the lean, the breath
 *   and the click ripple are movement, and they stop.
 *
 *   The loop stops when nothing is happening. It runs while the pointer is
 *   over the stage or a ripple is still alive, then paints one settled frame
 *   and cancels. A sign-in page left open on a desk costs nothing.
 */

/** Distance at which the sweep starts to wake a point. */
const WAKE_RADIUS = 168;
/** Two woken points closer than this are joined. Wider than the grid pitch so a
 *  point links to its diagonal neighbours too — at exactly one cell the network
 *  comes out as a lattice, which is the one shape it must not be. */
const LINK_DIST = 92;
/** Grid pitch. Points are jittered inside their cell so this never reads as a grid. */
const CELL = 54;
/** A ceiling for very large monitors — past this the lines cost more than they say. */
const MAX_POINTS = 460;
const RIPPLE_MS = 900;
const RIPPLE_REACH = 460;

interface Point {
  /** Where it lives. The lean is drawn as an offset; it never moves home. */
  hx: number;
  hy: number;
  r: number;
  /** Phase of the idle breath, so they do not pulse in unison. */
  phase: number;
  /** Current wakefulness, 0–1, eased toward its target each frame. */
  lit: number;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
}

export function LoginDots() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stage = canvas.parentElement;
    if (!stage) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let points: Point[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let ripples: Ripple[] = [];
    // Off-canvas until the pointer arrives, so nothing is lit on first paint.
    let px = -9999;
    let py = -9999;

    const build = () => {
      const rect = stage.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));

      // Cap the backing store at 2x. A 3x phone would trip the coarse-pointer
      // branch anyway, and past 2x the cost is real and the gain is not.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(w / CELL) + 1;
      const rows = Math.ceil(h / CELL) + 1;
      const next: Point[] = [];
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          if (next.length >= MAX_POINTS) break;
          // Jitter inside the cell — an even scatter with no clumps and no
          // rows, which pure randomness gives you neither of.
          next.push({
            hx: ix * CELL + (Math.random() - 0.5) * CELL * 0.8,
            hy: iy * CELL + (Math.random() - 0.5) * CELL * 0.8,
            r: 1.0 + Math.random() * 0.9,
            phase: Math.random() * Math.PI * 2,
            lit: 0,
          });
        }
      }
      points = next;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);

      const breath = still ? 0 : now / 1400;
      // Only woken points are considered for links, so the pair loop below is
      // over a handful rather than over everything on screen.
      const awake: { x: number; y: number; lit: number }[] = [];

      for (const p of points) {
        const dx = px - p.hx;
        const dy = py - p.hy;
        const d = Math.hypot(dx, dy);

        // The sweep. Falls off faster than linear so the edge of the radius is
        // soft and the centre is definite — a linear ramp reads as a circle
        // being dragged. Not squared: that left most of the radius too dim to
        // link anything, so the network only ever formed at the cursor itself.
        let target = d < WAKE_RADIUS ? (1 - d / WAKE_RADIUS) ** 1.5 : 0;

        // A click sends a band outward that wakes what it passes over.
        for (const rp of ripples) {
          const age = (now - rp.start) / RIPPLE_MS;
          if (age >= 1) continue;
          const reach = age * RIPPLE_REACH;
          const band = Math.abs(Math.hypot(rp.x - p.hx, rp.y - p.hy) - reach);
          if (band < 46) target = Math.max(target, (1 - band / 46) * (1 - age));
        }

        // Ease rather than jump: a point that lights instantly is a hover
        // state, and the whole idea is that the field takes a moment to find
        // things.
        p.lit += (target - p.lit) * (still ? 1 : 0.16);
        if (p.lit < 0.004) p.lit = 0;

        const lean = still ? 0 : p.lit * 7;
        const x = d > 0.001 ? p.hx + (dx / d) * lean : p.hx;
        const y = d > 0.001 ? p.hy + (dy / d) * lean : p.hy;

        // The idle breath is almost nothing — it exists so a field nobody has
        // touched is not perfectly dead, and it is gone the moment the point
        // is lit, because then the pointer is the reason it is moving.
        const idle = 0.10 + (still ? 0 : Math.sin(breath + p.phase) * 0.022);
        const alpha = Math.min(1, idle + p.lit * 0.78);
        const radius = p.r * (1 + p.lit * 0.85);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();

        if (p.lit > 0.08) awake.push({ x, y, lit: p.lit });
      }

      // The network. Drawn after the points so a line never sits on top of the
      // thing it connects, and capped by the weakest end so a link fades with
      // whichever of its two points is leaving the sweep.
      // The line has to survive being multiplied twice — once by the weaker of
      // its two ends, once by its own length — and the first version did not:
      // three fractions multiplied together landed the strongest link on the
      // screen at about 4/255, which is a line that is being drawn and cannot
      // be seen. Both terms are pulled toward 1 by a fractional power before
      // they are multiplied, so distance and wakefulness still shape the
      // network without extinguishing it.
      ctx.lineWidth = 1;
      for (let i = 0; i < awake.length; i++) {
        for (let j = i + 1; j < awake.length; j++) {
          const a = awake[i];
          const b = awake[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > LINK_DIST) continue;
          const strength =
            Math.min(a.lit, b.lit) ** 0.6 * (1 - d / LINK_DIST) ** 0.75 * 0.6;
          if (strength < 0.012) continue;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(190,205,255,${strength})`;
          ctx.stroke();
        }
      }

      ripples = ripples.filter((rp) => now - rp.start < RIPPLE_MS);
    };

    const frame = (now: number) => {
      draw(now);
      // Keep going while anything is still settling. `lit` eases toward zero,
      // so this also covers the frames after the pointer has left.
      const busy =
        ripples.length > 0 ||
        px > -9000 ||
        points.some((p) => p.lit > 0);
      if (busy) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    };

    const wake = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      wake();
    };

    const onLeave = () => {
      px = -9999;
      py = -9999;
      wake();
    };

    const onDown = (e: PointerEvent) => {
      if (still) return;
      const rect = stage.getBoundingClientRect();
      ripples.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        start: performance.now(),
      });
      wake();
    };

    const onHidden = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else {
        wake();
      }
    };

    build();
    // One settled frame regardless, so the layer is never blank — on a touch
    // device or under reduced motion this is the whole of it.
    draw(performance.now());

    const ro = new ResizeObserver(() => {
      build();
      draw(performance.now());
      if (fine) wake();
    });
    ro.observe(stage);

    if (fine) {
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerleave", onLeave);
      stage.addEventListener("pointerdown", onDown);
      document.addEventListener("visibilitychange", onHidden);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  // Inert and out of the accessibility tree: it is the room, not the content —
  // the same rule the aurora and the lattice already follow.
  return <canvas ref={ref} className="login-dots" aria-hidden="true" />;
}
