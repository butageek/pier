/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconPreview } from "@/components/icon-picker";
import type { EnrichedTile } from "@/lib/tiles";
import type { TileHealth } from "@/lib/types";

type DotState = "up" | "warn" | "down" | "idle";

/** Color (and glow) per state — the dot shape lives on the <span>. */
const DOT_CLASS: Record<DotState, string> = {
  up: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70",
  warn: "bg-amber-500 shadow-[0_0_6px] shadow-amber-500/70",
  down: "bg-red-500 shadow-[0_0_6px] shadow-red-500/70",
  idle: "bg-zinc-600",
};

/**
 * One status dot per card, combining container state with endpoint reachability.
 * Containers: green = running + reachable, amber = running but the endpoint
 * isn't responding, gray = stopped. Manual links: green = reachable,
 * red = unreachable, gray = checking. Hover spells out the details.
 */
function StatusDot({ tile, health }: { tile: EnrichedTile; health?: TileHealth }) {
  const stopped = tile.auto && !!tile.container_state && tile.container_state !== "running";
  if (!tile.auto && health === undefined) return null; // nothing probed (e.g. mailto:)

  let state: DotState;
  let title: string;
  if (stopped) {
    state = "idle";
    title = tile.container_state;
    if (health) title += health.state === "up" ? " · endpoint still responding" : " · endpoint unreachable";
  } else if (health === undefined) {
    state = "idle";
    title = "Checking reachability…";
  } else if (health.state === "up") {
    state = "up";
    const parts = [...(tile.auto ? ["running"] : []), "reachable"];
    if (health.code) parts.push(String(health.code));
    if (health.ms != null) parts.push(`${health.ms}ms`);
    title = parts.join(" · ");
  } else if (tile.auto) {
    state = "warn";
    title = `running · unreachable · ${health.error ?? "no response"}`;
  } else {
    state = "down";
    title = `unreachable · ${health.error ?? "no response"}`;
  }

  return <span title={title} className={`size-2 rounded-full ${DOT_CLASS[state]}`} />;
}

export function TileCard({
  tile,
  health,
  onEdit,
  onDelete,
  onHide,
}: {
  tile: EnrichedTile;
  /** Latest reachability probe; undefined until the first check completes. */
  health?: TileHealth;
  onEdit: (tile: EnrichedTile) => void;
  onDelete: (tile: EnrichedTile) => void;
  onHide: (tile: EnrichedTile) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const stopped = tile.auto && tile.container_state && tile.container_state !== "running";

  return (
    <div className="group relative">
      <Link
        href={tile.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-950/30"
      >
        <div className="size-11 shrink-0 overflow-hidden rounded-lg">
          {tile.iconUrl && !imgFailed ? (
            <img
              src={tile.iconUrl}
              alt={tile.title}
              className="size-full object-contain"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <IconPreview url={null} label={tile.title} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{tile.title}</span>
            <StatusDot tile={tile} health={health} />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {tile.description || tile.url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </Link>

      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground"
            aria-label="Link actions"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onEdit(tile)}>Edit</DropdownMenuItem>
            {tile.auto && <DropdownMenuItem onClick={() => onHide(tile)}>Hide</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(tile)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {stopped && <div className="pointer-events-none absolute inset-0 rounded-xl bg-background/40" />}
    </div>
  );
}
