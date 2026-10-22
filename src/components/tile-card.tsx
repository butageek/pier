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

  if (theme === "opal-glass") {
    // Opal Glass — frosted milk-glass bento capsule (compact horizontal)
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5">
        {renderIcon(
          "size-11",
          "rounded-2xl",
          "bg-white/80 border border-white/95 shadow-[0_4px_12px_rgba(100,115,145,0.12),inset_0_1.5px_2px_rgba(255,255,255,0.95)]"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold tracking-tight text-[#0f172a] transition-colors group-hover:text-[#0284c7]">
              {tile.title}
            </span>
            <div className="inline-flex items-center gap-1 text-[9px] font-bold text-[#0284c7] bg-white/85 border border-white/95 px-1.5 py-0.2 rounded-full shadow-[0_2px_8px_rgba(100,115,145,0.1),inset_0_1px_1px_#ffffff] shrink-0">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>{health?.ms ? `${health.ms}ms` : "ready"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {tile.group_name && (
              <span className="bg-white/70 border border-white/95 text-[#64748b] text-[9px] font-semibold px-1.5 py-0.2 rounded-full shrink-0">
                {tile.group_name}
              </span>
            )}
            <span className="truncate text-xs font-medium text-[#64748b]">
              {tile.description || tile.url.replace(/^https?:\/\//, "")}
            </span>
          </div>
        </div>
      </div>
    );
  } else if (theme === "monokai-synth") {
    // Monokai Synth — terminal telemetry card (compact horizontal)
    content = (
      <div className="flex items-center h-full gap-3.5 p-3.5 font-mono">
        {renderIcon(
          "size-11",
          "rounded-xl",
          "bg-[#221f22] border border-[#403e41] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[#fcfcfa] transition-colors group-hover:text-[#78dce8]">
              {tile.title}
            </span>
            <div className="inline-flex items-center gap-1 text-[9px] font-bold text-[#ff6188] bg-[#ff618818] border border-[#ff618844] px-1.5 py-0.2 rounded-md shrink-0">
              <span className="size-1.5 rounded-full bg-[#a9dc76]" />
              <span>{health?.ms ? `${health.ms}ms` : "RDY"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {tile.group_name && (
              <span className="text-[9px] font-semibold text-[#ffd866] shrink-0">[{tile.group_name}]</span>
            )}
            <span className="truncate text-xs text-[#939293]">
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

  return (
    <div
      ref={nodeRef}
      className={cn(
        "group relative rounded-xl transition-[opacity,transform,scale] duration-200 ease-out",
        reordering && "cursor-grab select-none active:cursor-grabbing",
        isDragging && "scale-95 opacity-40",
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
