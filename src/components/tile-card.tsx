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

function StateDot({ state }: { state: string }) {
  const running = state === "running";
  return (
    <span
      title={state}
      className={
        running
          ? "size-2 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/70"
          : "size-2 rounded-full bg-zinc-600"
      }
    />
  );
}

export function TileCard({
  tile,
  onEdit,
  onDelete,
  onHide,
}: {
  tile: EnrichedTile;
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
            {tile.auto && tile.container_state && <StateDot state={tile.container_state} />}
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
