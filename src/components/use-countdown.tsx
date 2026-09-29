"use client";

import { useEffect, useState } from "react";

/**
 * Seconds until `until` (epoch ms), ticking every second. Null before the
 * first tick (renders nothing server-side, avoiding hydration mismatches)
 * and once the moment has passed, until the parent passes a new deadline.
 */
export function useCountdown(until: number): number | null {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [until]);

  return left;
}

/** Tiny "Ns" countdown text; `label` becomes the tooltip ("Next refresh in 5s"). */
export function Countdown({
  until,
  label,
  className,
}: {
  until: number;
  label?: string;
  className?: string;
}) {
  const left = useCountdown(until);
  if (left == null) return null;
  return (
    <span className={className} title={label ? `${label} in ${left}s` : undefined}>
      {left}s
    </span>
  );
}
