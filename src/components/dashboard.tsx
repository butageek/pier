"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AddDialog } from "@/components/add-dialog";
import { DeviceCard } from "@/components/device-card";
import { TileCard } from "@/components/tile-card";
import { TileDialog } from "@/components/tile-dialog";
import type { EnrichedTile } from "@/lib/tiles";
import type { DeviceStatus, SafeDevice } from "@/lib/types";

type TilesResponse = { tiles: EnrichedTile[] };
type DevicesResponse = { devices: SafeDevice[] };

function groupTiles(tiles: EnrichedTile[]): [string, EnrichedTile[]][] {
  const map = new Map<string, EnrichedTile[]>();
  for (const t of tiles) {
    const key = t.group_name || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  // Named groups first (alphabetical), ungrouped last.
  return [...map.entries()].sort((a, b) => {
    if (!a[0]) return 1;
    if (!b[0]) return -1;
    return a[0].localeCompare(b[0]);
  });
}

export function Dashboard() {
  const [tiles, setTiles] = useState<EnrichedTile[] | null>(null);
  const [devices, setDevices] = useState<SafeDevice[]>([]);
  const [statuses, setStatuses] = useState<Record<number, DeviceStatus>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"link" | "device">("link");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedTile | null>(null);
  const [scanningIds, setScanningIds] = useState<Set<number>>(new Set());

  const refreshTiles = useCallback(async () => {
    try {
      const res = await fetch("/api/tiles");
      const data = (await res.json()) as TilesResponse;
      setTiles(data.tiles);
    } catch {
      /* transient */
    }
  }, []);

  const refreshStatuses = useCallback(async (devs: SafeDevice[]) => {
    const entries = await Promise.allSettled(
      devs.map(async (d) => {
        const res = await fetch(`/api/devices/${d.id}/status`);
        return [d.id, (await res.json()) as DeviceStatus] as const;
      })
    );
    setStatuses((prev) => {
      const next = { ...prev };
      for (const e of entries) if (e.status === "fulfilled") next[e.value[0]] = e.value[1];
      return next;
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices");
      const data = (await res.json()) as DevicesResponse;
      setDevices(data.devices);
      refreshStatuses(data.devices);
    } catch {
      /* transient */
    }
  }, [refreshStatuses]);

  useEffect(() => {
    // Initial load (setState happens asynchronously once data arrives).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTiles();
    refreshDevices();
    const tilesTimer = setInterval(refreshTiles, 60_000);
    const statusTimer = setInterval(() => refreshStatuses(devices), 15_000);
    return () => {
      clearInterval(tilesTimer);
      clearInterval(statusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTiles, refreshDevices]);

  const scanDevice = useCallback(
    async (device: SafeDevice) => {
      setScanningIds((s) => new Set(s).add(device.id));
      try {
        const res = await fetch(`/api/devices/${device.id}/scan`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Scan failed");
        toast.success(`Scanned ${device.name}`, {
          description: `${data.containersSeen} containers · +${data.tilesCreated} new links, ~${data.tilesRemoved} removed`,
        });
        await Promise.all([refreshTiles(), refreshDevices()]);
      } catch (e) {
        toast.error(`Scan failed: ${e instanceof Error ? e.message : "unknown error"}`);
      } finally {
        setScanningIds((s) => {
          const n = new Set(s);
          n.delete(device.id);
          return n;
        });
      }
    },
    [refreshTiles, refreshDevices]
  );

  const removeDevice = useCallback(
    async (device: SafeDevice) => {
      const res = await fetch(`/api/devices/${device.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Removed ${device.name} and its auto-discovered links`);
        await Promise.all([refreshTiles(), refreshDevices()]);
      } else {
        toast.error("Failed to remove device");
      }
    },
    [refreshTiles, refreshDevices]
  );

  const hideTile = useCallback(
    async (tile: EnrichedTile) => {
      setTiles((prev) => prev?.map((t) => (t.id === tile.id ? { ...t, hidden: 1 } : t)) ?? prev);
      const res = await fetch(`/api/tiles/${tile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden: true }),
      });
      if (res.ok) toast.success(`Hidden "${tile.title}" — restore it in Settings`);
      else {
        toast.error("Failed to hide link");
        refreshTiles();
      }
    },
    [refreshTiles]
  );

  const deleteTile = useCallback(
    async (tile: EnrichedTile) => {
      setTiles((prev) => prev?.filter((t) => t.id !== tile.id) ?? prev);
      const res = await fetch(`/api/tiles/${tile.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete link");
        refreshTiles();
      }
    },
    [refreshTiles]
  );

  const groups = tiles ? [...new Set(tiles.filter((t) => !t.auto).map((t) => t.group_name).filter(Boolean))] : [];
  const visible = tiles?.filter((t) => !t.hidden) ?? null;
  const grouped = visible ? groupTiles(visible) : [];

  return (
    <div className="space-y-8 pb-16">
      {devices.length > 0 && (
        <section aria-label="Devices">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard
                key={d.id}
                device={d}
                status={statuses[d.id] ?? null}
                onScan={scanDevice}
                onRemove={removeDevice}
                scanning={scanningIds.has(d.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Links">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {visible ? (visible.length === 0 ? "Links" : `${visible.length} links`) : ""}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setAddTab("link");
                setAddOpen(true);
              }}
            >
              <Plus data-icon="inline-start" className="size-3.5" /> Add
            </Button>
          </div>
        </div>

        {tiles === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
        ) : visible !== null && visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Add a link manually, or add a device and Pier auto-discovers its Docker containers as
              links.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddTab("link");
                setAddOpen(true);
              }}
            >
              <Plus data-icon="inline-start" className="size-3.5" /> Add a link
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([group, groupTiles]) => (
              <div key={group || "_ungrouped"}>
                {group && (
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group}
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {groupTiles.map((t) => (
                    <TileCard
                      key={t.id}
                      tile={t}
                      onEdit={(tile) => {
                        setEditing(tile);
                        setEditOpen(true);
                      }}
                      onDelete={deleteTile}
                      onHide={hideTile}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AddDialog
        key={addOpen ? `open-${addTab}` : "closed"}
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultTab={addTab}
        groups={groups}
        onSaved={refreshTiles}
        onDeviceAdded={() => {
          refreshTiles();
          refreshDevices();
        }}
      />

      {editing && (
        <TileDialog
          key={`edit-${editing.id}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          tile={editing}
          groups={groups}
          onSaved={refreshTiles}
        />
      )}
    </div>
  );
}
