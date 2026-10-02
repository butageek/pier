"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconPreview } from "@/components/icon-picker";
import { TileDialog } from "@/components/tile-dialog";
import type { EnrichedTile } from "@/lib/tiles";

/** Details panel: the hidden links list with restore actions. */
export function HiddenLinks({
  tiles,
  groups,
  onChanged,
}: {
  tiles: EnrichedTile[];
  groups: string[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<EnrichedTile | null>(null);

  const show = async (tile: EnrichedTile) => {
    setBusy((s) => new Set(s).add(tile.id));
    try {
      const res = await fetch(`/api/tiles/${tile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden: false }),
      });
      if (!res.ok) throw new Error();
      toast.success(`"${tile.title}" is back on the dashboard`);
      onChanged();
    } catch {
      toast.error("Failed to restore link");
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(tile.id);
        return n;
      });
    }
  };

  const showAll = async () => {
    const ids = tiles.map((t) => t.id);
    setBusy((s) => new Set([...s, ...ids]));
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/tiles/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hidden: false }),
        })
      )
    );
    toast.success("All hidden links restored");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {tiles.length} hidden link{tiles.length === 1 ? "" : "s"}
        </h2>
        {tiles.length > 1 && (
          <Button size="sm" variant="outline" onClick={showAll}>
            Show all
          </Button>
        )}
      </div>

      {tiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing is hidden. Hide a container link from its ⋯ menu on the dashboard — handy when one
            container publishes several ports and you only need one.
          </p>
          <Button variant="ghost" size="sm" className="mt-3" render={<Link href="/" />} nativeButton={false}>
            Back to the dashboard
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border/70">
          {tiles.map((t) => (
            <li key={t.id} className="flex items-center gap-3 p-3">
              <div className="size-9 shrink-0 overflow-hidden rounded-lg">
                <IconPreview url={t.iconUrl} label={t.title} slug={t.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.url.replace(/^https?:\/\//, "")}
                  {t.group_name ? ` · ${t.group_name}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(t)}
                  aria-label={`Edit ${t.title}`}
                >
                  <Pencil data-icon="inline-start" className="size-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => show(t)} disabled={busy.has(t.id)}>
                  <Eye data-icon="inline-start" className="size-3.5" /> Show
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TileDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        tile={editing}
        groups={groups}
        onSaved={onChanged}
      />

      <p className="text-xs text-muted-foreground">
        Hidden links stay in sync with scans — their container keeps being tracked, they just don&apos;t
        clutter the dashboard. Removing the device removes its links, hidden or not.
      </p>
    </div>
  );
}
