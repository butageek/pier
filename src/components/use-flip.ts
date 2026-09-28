"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * FLIP animation for drag-reorder gestures. Callers register each reorderable
 * element in the returned map; whenever a live-preview move re-renders the
 * list, elements whose layout position changed slide from their old spot to
 * the new one instead of teleporting.
 *
 * The dragged element itself should be skipped via `skip` — its native drag
 * ghost already follows the cursor, so an in-flow slide would double the
 * motion. Respects prefers-reduced-motion (positions jump instantly).
 *
 * Positions are measured with offsetLeft/offsetTop, which ignore transforms —
 * this keeps measurements valid even when taken mid-slide.
 */
export function useFlipReorder<K>(active: boolean, skip?: (key: K) => boolean) {
  const nodes = useRef(new Map<K, HTMLElement>());
  const positions = useRef(new Map<K, { left: number; top: number }>());

  useLayoutEffect(() => {
    if (!active) {
      positions.current.clear();
      return;
    }
    const next = new Map<K, { left: number; top: number }>();
    for (const [key, el] of nodes.current) {
      if (el.isConnected) next.set(key, { left: el.offsetLeft, top: el.offsetTop });
    }
    const prev = positions.current;
    if (prev.size > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [key, el] of nodes.current) {
        if (skip?.(key)) continue;
        const last = prev.get(key);
        const now = next.get(key);
        if (!last || !now || !el.isConnected) continue;
        const dx = last.left - now.left;
        const dy = last.top - now.top;
        if (!dx && !dy) continue;
        // Invert: put the element where it was, then play it into place.
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth; // commit the inverted position before animating
        el.style.transition = "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = "";
        el.addEventListener(
          "transitionend",
          function done(e) {
            if (e.propertyName !== "transform") return;
            el.style.transition = "";
            el.removeEventListener("transitionend", done);
          }
        );
      }
    }
    positions.current = next;
  });

  return nodes;
}
