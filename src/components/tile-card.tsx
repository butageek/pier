/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
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
import type { ConcreteTheme } from "@/lib/theme";

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

  if (state === "up" && health?.ms != null) {
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-400 shrink-0"
      >
        <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
        <span>{health.ms}ms</span>
      </span>
    );
  }

  return (
    <span className="flex items-center shrink-0" title={title}>
      <span className={`size-2 rounded-full ${DOT_CLASS[state]}`} />
    </span>
  );
}

export const PINBOARD_TAPES = [
  "rgba(250, 204, 21, 0.75)",
  "rgba(52, 211, 153, 0.75)",
  "rgba(244, 114, 182, 0.75)",
  "rgba(96, 165, 250, 0.75)",
];

export function TileCard({
  tile,
  health,
  theme,
  onEdit,
  onDelete,
  onHide,
  reordering = false,
  isDragging = false,
  nodeRef,
  onReorderStart,
  onReorderOver,
  onReorderEnd,
}: {
  tile: EnrichedTile;
  /** Latest reachability probe; undefined until the first check completes. */
  health?: TileHealth;
  /** Active theme to render theme-specific layout treatments */
  theme?: ConcreteTheme;
  onEdit: (tile: EnrichedTile) => void;
  onDelete: (tile: EnrichedTile) => void;
  onHide: (tile: EnrichedTile) => void;
  /** Layout-edit mode: the card becomes a drag handle instead of a link. */
  reordering?: boolean;
  isDragging?: boolean;
  /** Registers the card root for FLIP slide animations (see useFlipReorder). */
  nodeRef?: (el: HTMLDivElement | null) => void;
  onReorderStart?: (tile: EnrichedTile) => void;
  /** Fires on dragenter/dragover; `at` is the event's monotonic timeStamp. */
  onReorderOver?: (tile: EnrichedTile, at: number) => void;
  onReorderEnd?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const stopped = tile.auto && tile.container_state && tile.container_state !== "running";

  // dragenter fires on arrival; dragover keeps firing while hovered, resolving
  // the hover once the swap cooldown ends.
  const onHoverTarget = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onReorderOver?.(tile, e.timeStamp);
  };

  const renderIcon = (
    sizeClass = "size-11",
    roundedClass = "rounded-lg",
    borderClass = "border border-border/50 bg-muted/40"
  ) => (
    <div
      className={cn(
        sizeClass,
        roundedClass,
        borderClass,
        "shrink-0 overflow-hidden p-1 flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
      )}
    >
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
  );

  let content: React.ReactNode;

  if (theme === "bauhaus-studio") {
    // Light 1: Bauhaus Modern Architectural Exhibition Card (Compact horizontal)
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5">
        {renderIcon(
          "size-11",
          "rounded-lg",
          "bg-white border-2 border-[#121316] shadow-[2px_2px_0px_#121316]"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-extrabold tracking-tight text-[#121316] transition-colors group-hover:text-blue-700">
              {tile.title}
            </span>
            <div className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-emerald-950 bg-emerald-100 border border-[#121316] px-1.5 py-0.2 rounded-full shadow-[1px_1px_0px_#121316] shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-500 border border-[#121316]" />
              <span>{health?.ms ? `${health.ms}ms` : "READY"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {tile.group_name && (
              <span className="bg-[#facc15] text-[#121316] font-mono text-[9px] font-bold px-1.5 py-0.2 border border-[#121316] rounded shadow-[1px_1px_0px_#121316] shrink-0">
                {tile.group_name}
              </span>
            )}
            <span className="truncate text-xs font-medium text-[#595d66]">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else if (theme === "bauhaus-dark") {
    // Dark 1: Bauhaus Nocturne Constructivist Card (Compact horizontal)
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5">
        {renderIcon(
          "size-11",
          "rounded-lg",
          "bg-[#1c1d22] border-2 border-[#f9f8f6] shadow-[2px_2px_0px_#facc15]"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-extrabold tracking-tight text-[#f9f8f6] transition-colors group-hover:text-blue-400">
              {tile.title}
            </span>
            <div className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-emerald-300 bg-emerald-950/80 border border-[#f9f8f6] px-1.5 py-0.2 rounded-full shadow-[1px_1px_0px_#facc15] shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-400 border border-[#f9f8f6]" />
              <span>{health?.ms ? `${health.ms}ms` : "READY"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {tile.group_name && (
              <span className="bg-[#facc15] text-[#121316] font-mono text-[9px] font-bold px-1.5 py-0.2 border border-[#f9f8f6] rounded shadow-[1px_1px_0px_#facc15] shrink-0">
                {tile.group_name}
              </span>
            )}
            <span className="truncate text-xs font-medium text-[#9ca3af]">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else if (theme === "cad-blueprint") {
    // Light 2: Technical Drafting Vellum Schematic (Compact horizontal)
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5">
        {renderIcon(
          "size-10",
          "rounded-xs",
          "bg-blue-50/70 border border-blue-600/30"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold tracking-tight text-slate-900 transition-colors group-hover:text-blue-700">
              {tile.title}
            </span>
            <span className="font-mono text-[9px] font-bold text-blue-800 bg-blue-100/70 border border-blue-600/30 px-1.5 py-0.2 rounded-xs shrink-0">
              DWG #{String(tile.id).padStart(2, "0")} · {health?.ms ? `${health.ms}ms` : "OK"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {tile.group_name && (
              <span className="font-mono text-[9px] text-blue-700 font-semibold shrink-0">
                [{tile.group_name}]
              </span>
            )}
            <span className="truncate font-mono text-xs text-slate-500">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else if (theme === "cad-dark") {
    // Dark 2: Technical CAD Night Schematic (Compact horizontal)
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5">
        {renderIcon(
          "size-10",
          "rounded-xs",
          "bg-sky-950/40 border border-sky-400/40"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold tracking-tight text-[#f0f6fc] transition-colors group-hover:text-sky-300">
              {tile.title}
            </span>
            <span className="font-mono text-[9px] font-bold text-sky-300 bg-sky-950/80 border border-sky-400/40 px-1.5 py-0.2 rounded-xs shrink-0">
              DWG #{String(tile.id).padStart(2, "0")} · {health?.ms ? `${health.ms}ms` : "OK"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {tile.group_name && (
              <span className="font-mono text-[9px] text-sky-400 font-semibold shrink-0">
                [{tile.group_name}]
              </span>
            )}
            <span className="truncate font-mono text-xs text-slate-400">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else if (theme === "pinboard-atelier") {
    // Light 3: Creative Pinboard Sticky Note (Compact horizontal)
    const tapeColor = PINBOARD_TAPES[tile.id % PINBOARD_TAPES.length];
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5 pt-4.5 relative">
        <div className="washi-tape-strip" style={{ backgroundColor: tapeColor }} />
        {renderIcon(
          "size-10",
          "rounded-xl",
          "bg-amber-50/70 border border-amber-200/70 shadow-xs"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-stone-800 transition-colors group-hover:text-orange-600">
              {tile.title}
            </span>
            <div className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold text-amber-900 bg-amber-100/80 border border-amber-300/60 px-1.5 py-0.2 rounded-full shadow-xs shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>{health?.ms ? `${health.ms}ms` : "ready"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {tile.group_name && (
              <span className="bg-stone-100/90 px-1.5 py-0.2 rounded border border-stone-200 text-stone-700 text-[9px] font-medium shrink-0">
                {tile.group_name}
              </span>
            )}
            <span className="truncate text-xs text-stone-500">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else if (theme === "pinboard-dark") {
    // Dark 3: Pinboard Midnight Sticky Note (Compact horizontal)
    const tapeColor = PINBOARD_TAPES[tile.id % PINBOARD_TAPES.length];
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5 pt-4.5 relative">
        <div className="washi-tape-strip" style={{ backgroundColor: tapeColor }} />
        {renderIcon(
          "size-10",
          "rounded-xl",
          "bg-amber-950/30 border border-amber-600/30 shadow-xs"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-stone-200 transition-colors group-hover:text-amber-400">
              {tile.title}
            </span>
            <div className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold text-amber-200 bg-amber-950/70 border border-amber-700/50 px-1.5 py-0.2 rounded-full shadow-xs shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>{health?.ms ? `${health.ms}ms` : "ready"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {tile.group_name && (
              <span className="bg-stone-800/90 px-1.5 py-0.2 rounded border border-stone-700 text-stone-300 text-[9px] font-medium shrink-0">
                {tile.group_name}
              </span>
            )}
            <span className="truncate text-xs text-stone-400">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else {
    // Default / classic dock layout
    content = (
      <div className="flex items-center gap-3 p-3.5">
        {renderIcon("size-11", "rounded-lg", "bg-muted/40 border border-border/50")}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
              {tile.title}
            </span>
            <StatusDot tile={tile} health={health} />
          </div>
          <div className="truncate text-xs text-muted-foreground/80 mt-0.5">
            {tile.description || tile.url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    );
  }

  const isPinboard = theme === "pinboard-atelier" || theme === "pinboard-dark";
  const tiltClass =
    isPinboard && !reordering
      ? `pinboard-tilt-${tile.id % 4} transition-transform duration-200 ease-out`
      : "";

  return (
    <div
      ref={nodeRef}
      className={cn(
        "group relative rounded-xl transition-[opacity,transform,scale] duration-200 ease-out",
        reordering && "cursor-grab select-none active:cursor-grabbing",
        isDragging && "scale-95 opacity-40",
        tiltClass
      )}
      draggable={reordering}
      onDragStart={
        reordering
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(tile.id)); // Firefox requires data
              onReorderStart?.(tile);
            }
          : undefined
      }
      onDragEnter={reordering ? onHoverTarget : undefined}
      onDragOver={reordering ? onHoverTarget : undefined}
      onDrop={reordering ? (e) => e.preventDefault() : undefined}
      onDragEnd={reordering ? () => onReorderEnd?.() : undefined}
    >
      {reordering ? (
        <div
          title="Drag to reorder"
          className="flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-card/60 p-3.5 transition-all"
        >
          <GripVertical className="size-4 shrink-0 text-primary/80" />
          <div className="min-w-0 flex-1">
            <span className="truncate text-sm font-semibold">{tile.title}</span>
            <div className="truncate text-xs text-muted-foreground">{tile.url}</div>
          </div>
        </div>
      ) : (
        <Link
          href={tile.url}
          target="_blank"
          rel="noreferrer"
          data-tile-card=""
          className="theme-card block h-full rounded-xl border border-border/70 bg-card/90 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md hover:shadow-primary/5"
        >
          {content}
        </Link>
      )}

      {!reordering && (
        <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground hover:bg-muted"
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
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(tile.url);
                toast.success(`Copied "${tile.title}" URL`);
              }}
            >
              Copy URL
            </DropdownMenuItem>
            {tile.auto && <DropdownMenuItem onClick={() => onHide(tile)}>Hide</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(tile)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      )}

      {stopped && <div className="pointer-events-none absolute inset-0 rounded-xl bg-background/40" />}
    </div>
  );
}
