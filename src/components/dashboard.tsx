"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, PencilLine, Plus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AddDialog } from "@/components/add-dialog";
import { DeviceEditDialog } from "@/components/device-edit-dialog";
import { DeviceCard } from "@/components/device-card";
import { TileCard } from "@/components/tile-card";
import { TileDialog } from "@/components/tile-dialog";
import { useFlipReorder } from "@/components/use-flip";
import { Countdown } from "@/components/use-countdown";
import type { EnrichedTile } from "@/lib/tiles";
import type { DeviceStatus, SafeDevice, TileHealth } from "@/lib/types";

type TilesResponse = { tiles: EnrichedTile[]; groupOrder?: string[] };
type DevicesResponse = { devices: SafeDevice[] };
type HealthResponse = { health: Record<number, TileHealth> };

/** Never subscribes — see the hydration check below. */
const noopSubscribe = () => () => {};

// Dashboard refresh cadences (ms) — one source for the timers, the countdown
// deadlines, and their reset after each tick.
const STATUS_PERIOD_MS = 15_000; // device usage (card bars + popups)
const HEALTH_PERIOD_MS = 30_000; // link reachability dots
const TILES_PERIOD_MS = 60_000; // the tiles list itself

// Must stay ≥ the FLIP slide duration in useFlipReorder: while a displaced tile
// is still sliding, its transformed box can sweep across the cursor and re-fire
// dragenter, which would swap the pair back and forth forever. Compared against
// the drag event's monotonic timeStamp, not the wall clock.
const SWAP_COOLDOWN_MS = 220;

/** Move the item at `from` to index `to` — lands after the target when
 *  dragging forward, before it when dragging back. */
function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Sort `items` into the given id order; ids not listed (added while editing,
 *  e.g. via a scan) keep their relative order, falling to the end. */
function restoreOrder<T>(items: T[], order: number[], idOf: (item: T) => number): T[] {
  const rank = new Map(order.map((id, i) => [id, i] as [number, number]));
  return items.slice().sort((a, b) => (rank.get(idOf(a)) ?? Infinity) - (rank.get(idOf(b)) ?? Infinity));
}

function groupTiles(tiles: EnrichedTile[], order?: string[]): [string, EnrichedTile[]][] {
  const map = new Map<string, EnrichedTile[]>();
  for (const t of tiles) {
    const key = t.group_name || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  // User-arranged groups first (in saved order), groups never arranged after
  // those (alphabetical), ungrouped last.
  const pos = new Map((order ?? []).map((name, i) => [name, i]));
  return [...map.entries()].sort((a, b) => {
    if (!a[0]) return 1;
    if (!b[0]) return -1;
    const pa = pos.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
    const pb = pos.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : a[0].localeCompare(b[0]);
  });
}

export function Dashboard() {
  // False while hydrating, true afterwards — portals into the SSR-rendered
  // site header must wait for hydration, else the client tree mismatches
  // the server HTML and React remounts the whole page.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const [tiles, setTiles] = useState<EnrichedTile[] | null>(null);
  const [devices, setDevices] = useState<SafeDevice[]>([]);
  const [statuses, setStatuses] = useState<Record<number, DeviceStatus>>({});
  const [health, setHealth] = useState<Record<number, TileHealth>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"link" | "device">("link");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedTile | null>(null);
  const [scanningIds, setScanningIds] = useState<Set<number>>(new Set());
  const [editDeviceOpen, setEditDeviceOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<SafeDevice | null>(null);
  const [editLayout, setEditLayout] = useState(false);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  // Next-scheduled refresh times (epoch ms) shown as countdowns on cards.
  const [statusRefreshAt, setStatusRefreshAt] = useState(() => Date.now() + STATUS_PERIOD_MS);
  const [healthRefreshAt, setHealthRefreshAt] = useState(() => Date.now() + HEALTH_PERIOD_MS);
  const [dragTileId, setDragTileId] = useState<number | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [dragDeviceId, setDragDeviceId] = useState<number | null>(null);
  const dragTileRef = useRef<number | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const dragDeviceRef = useRef<number | null>(null);
  const tileOrderDirty = useRef(false);
  const groupOrderDirty = useRef(false);
  const deviceOrderDirty = useRef(false);
  // Order as persisted when layout editing started — Cancel's restore point.
  const layoutSnapshotRef = useRef<{ tileIds: number[]; groups: string[]; deviceIds: number[] } | null>(null);
  // Latest-value refs, updated synchronously by every mutation below — drag
  // handlers read these so a drop immediately after a move can't act on a
  // stale render closure (all of a drag's events can fire within one task).
  const tilesRef = useRef<EnrichedTile[] | null>(null);
  const groupOrderRef = useRef<string[]>([]);
  const devicesRef = useRef<SafeDevice[]>([]);

  const applyTiles = useCallback((next: EnrichedTile[] | null) => {
    tilesRef.current = next;
    setTiles(next);
  }, []);

  const applyDevices = useCallback((next: SafeDevice[]) => {
    devicesRef.current = next;
    setDevices(next);
  }, []);

  // Same ref+state pairing for group order, so drag handlers always read the
  // latest value without waiting for a render.
  const applyGroupOrder = useCallback((next: string[]) => {
    groupOrderRef.current = next;
    setGroupOrder(next);
  }, []);

  // FLIP slide animations while a drag is live-previewing a new layout.
  const tileNodes = useFlipReorder<number>(dragTileId != null, (id) => id === dragTileId);
  const groupNodes = useFlipReorder<string>(dragGroup != null, (name) => name === dragGroup);
  const deviceNodes = useFlipReorder<number>(dragDeviceId != null, (id) => id === dragDeviceId);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = (await res.json()) as HealthResponse;
      setHealth(data.health);
    } catch {
      /* transient */
    }
  }, []);

  const refreshTiles = useCallback(async () => {
    try {
      const res = await fetch("/api/tiles");
      const data = (await res.json()) as TilesResponse;
      applyTiles(data.tiles);
      applyGroupOrder(data.groupOrder ?? []);
      refreshHealth(); // probe newly added/changed links right away
    } catch {
      /* transient */
    }
  }, [refreshHealth, applyTiles, applyGroupOrder]);

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
      applyDevices(data.devices);
      refreshStatuses(data.devices);
    } catch {
      /* transient */
    }
  }, [refreshStatuses, applyDevices]);

  useEffect(() => {
    // Initial load (setState happens asynchronously once data arrives).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTiles();
    refreshDevices();
    const tilesTimer = setInterval(refreshTiles, TILES_PERIOD_MS);
    const healthTimer = setInterval(() => {
      refreshHealth();
      setHealthRefreshAt(Date.now() + HEALTH_PERIOD_MS);
    }, HEALTH_PERIOD_MS);
    const statusTimer = setInterval(() => {
      refreshStatuses(devices);
      setStatusRefreshAt(Date.now() + STATUS_PERIOD_MS);
    }, STATUS_PERIOD_MS);
    return () => {
      clearInterval(tilesTimer);
      clearInterval(healthTimer);
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
        const noun = device.type === "proxmox" ? "guests" : "containers";
        toast.success(`Scanned ${device.name}`, {
          description: `${data.containersSeen} ${noun} · +${data.tilesCreated} new links, ~${data.tilesRemoved} removed`,
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
      const prev = tilesRef.current;
      if (prev) applyTiles(prev.map((t) => (t.id === tile.id ? { ...t, hidden: 1 } : t)));
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
    [applyTiles, refreshTiles]
  );

  const deleteTile = useCallback(
    async (tile: EnrichedTile) => {
      const prev = tilesRef.current;
      if (prev) applyTiles(prev.filter((t) => t.id !== tile.id));
      const res = await fetch(`/api/tiles/${tile.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete link");
        refreshTiles();
      }
    },
    [applyTiles, refreshTiles]
  );

  // ---- Layout editing (drag & drop) -------------------------------------
  // Native HTML5 DnD with live preview: dragging over a card moves the dragged
  // tile to that slot immediately; the order is persisted on drag end. Tiles
  // reorder within their group only; group headers (in edit mode) reorder groups.
  const lastSwapAt = useRef(-Infinity);

  const putOrder = useCallback(
    async (url: string, body: Record<string, unknown>, rollback: () => void) => {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Couldn't save the new layout");
        rollback();
      }
    },
    []
  );

  const persistLayout = useCallback(
    (payload: { ids?: number[]; groups?: string[] }) => putOrder("/api/tiles/order", payload, refreshTiles),
    [putOrder, refreshTiles]
  );

  const persistDeviceOrder = useCallback(
    (ids: number[]) => putOrder("/api/devices/order", { ids }, refreshDevices),
    [putOrder, refreshDevices]
  );

  const onTileDragStart = (tile: EnrichedTile) => {
    dragTileRef.current = tile.id;
    setDragTileId(tile.id);
    lastSwapAt.current = -Infinity; // first hover responds immediately
  };

  const onTileDragEnter = (target: EnrichedTile, at: number) => {
    const dragId = dragTileRef.current;
    const tiles = tilesRef.current;
    if (dragId == null || dragId === target.id || !tiles) return;
    if (at - lastSwapAt.current < SWAP_COOLDOWN_MS) return; // let the slide settle
    const from = tiles.findIndex((t) => t.id === dragId);
    const to = tiles.findIndex((t) => t.id === target.id);
    if (from < 0 || to < 0 || tiles[from].group_name !== target.group_name) return; // same group only
    tileOrderDirty.current = true;
    lastSwapAt.current = at;
    applyTiles(moveItem(tiles, from, to));
  };

  const onTileDragEnd = () => {
    dragTileRef.current = null;
    setDragTileId(null);
    if (!tileOrderDirty.current) return;
    tileOrderDirty.current = false;
    persistLayout({ ids: (tilesRef.current ?? []).map((t) => t.id) });
  };

  const onGroupDragStart = (name: string) => {
    dragGroupRef.current = name;
    setDragGroup(name);
  };

  const onGroupDragEnter = (target: string, at: number) => {
    const drag = dragGroupRef.current;
    if (!drag || drag === target) return;
    if (at - lastSwapAt.current < SWAP_COOLDOWN_MS) return; // let the slide settle
    const visible = (tilesRef.current ?? []).filter((t) => !t.hidden);
    const renderedGroups = groupTiles(visible, groupOrderRef.current)
      .map(([name]) => name)
      .filter(Boolean);
    const from = renderedGroups.indexOf(drag);
    const to = renderedGroups.indexOf(target);
    if (from < 0 || to < 0) return;
    // Keep any known-but-currently-hidden groups after the rendered ones.
    const rest = groupOrderRef.current.filter((n) => !renderedGroups.includes(n));
    groupOrderDirty.current = true;
    lastSwapAt.current = at;
    applyGroupOrder([...moveItem(renderedGroups, from, to), ...rest]);
  };

  const onGroupDragEnd = () => {
    dragGroupRef.current = null;
    setDragGroup(null);
    if (!groupOrderDirty.current) return;
    groupOrderDirty.current = false;
    persistLayout({ groups: groupOrderRef.current });
  };

  const onDeviceDragStart = (device: SafeDevice) => {
    dragDeviceRef.current = device.id;
    setDragDeviceId(device.id);
    lastSwapAt.current = -Infinity; // first hover responds immediately
  };

  const onDeviceDragEnter = (target: SafeDevice, at: number) => {
    const dragId = dragDeviceRef.current;
    const devs = devicesRef.current;
    if (dragId == null || dragId === target.id) return;
    if (at - lastSwapAt.current < SWAP_COOLDOWN_MS) return; // let the slide settle
    const from = devs.findIndex((d) => d.id === dragId);
    const to = devs.findIndex((d) => d.id === target.id);
    if (from < 0 || to < 0) return;
    deviceOrderDirty.current = true;
    lastSwapAt.current = at;
    applyDevices(moveItem(devs, from, to));
  };

  const onDeviceDragEnd = () => {
    dragDeviceRef.current = null;
    setDragDeviceId(null);
    if (!deviceOrderDirty.current) return;
    deviceOrderDirty.current = false;
    persistDeviceOrder(devicesRef.current.map((d) => d.id));
  };

  const startLayoutEdit = () => {
    layoutSnapshotRef.current = {
      tileIds: (tilesRef.current ?? []).map((t) => t.id),
      groups: groupOrderRef.current.slice(),
      deviceIds: devicesRef.current.map((d) => d.id),
    };
    setEditLayout(true);
  };

  const cancelLayoutEdit = () => {
    setEditLayout(false);
    const snapshot = layoutSnapshotRef.current;
    if (!snapshot) return;
    // Restore the orders as of entering edit mode (items that appeared since
    // fall to the end) — each drop already persisted its arrangement, so write
    // the snapshot back.
    const restoredTiles = restoreOrder(tilesRef.current ?? [], snapshot.tileIds, (t) => t.id);
    applyTiles(restoredTiles);
    applyGroupOrder(snapshot.groups);
    persistLayout({ ids: restoredTiles.map((t) => t.id), groups: snapshot.groups });
    const restoredDevices = restoreOrder(devicesRef.current, snapshot.deviceIds, (d) => d.id);
    applyDevices(restoredDevices);
    persistDeviceOrder(restoredDevices.map((d) => d.id));
  };

  const groups = tiles ? [...new Set(tiles.filter((t) => !t.auto).map((t) => t.group_name).filter(Boolean))] : [];
  const visible = tiles?.filter((t) => !t.hidden) ?? null;
  const grouped = visible ? groupTiles(visible, groupOrder) : [];
  // Page-level actions (Add / layout editing) portal into the site header so
  // they live in the navbar instead of a floating row between sections.
  const headerSlot = mounted ? document.getElementById("header-actions") : null;
  // "deviceId|guestId" -> first discovered URL: makes Proxmox guest names clickable.
  const guestLinks = useMemo(() => {
    const links: Record<string, string> = {};
    for (const t of tiles ?? []) {
      if (t.device_id != null && t.container_id) {
        const key = `${t.device_id}|${t.container_id}`;
        if (!links[key]) links[key] = t.url;
      }
    }
    return links;
  }, [tiles]);

  return (
    <div className="space-y-8 pb-16">
      {devices.length > 0 && (
        <section aria-label="Devices">
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard
                key={d.id}
                device={d}
                status={statuses[d.id] ?? null}
                guestLinks={guestLinks}
                onScan={scanDevice}
                onEdit={(d) => {
                  setEditingDevice(d);
                  setEditDeviceOpen(true);
                }}
                onRemove={removeDevice}
                scanning={scanningIds.has(d.id)}
                reordering={editLayout}
                isDragging={dragDeviceId === d.id}
                nodeRef={(el) => {
                  if (el) deviceNodes.current.set(d.id, el);
                  else deviceNodes.current.delete(d.id);
                }}
                onReorderStart={onDeviceDragStart}
                onReorderOver={onDeviceDragEnter}
                onReorderEnd={onDeviceDragEnd}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Links">
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
            {grouped.map(([group, items]) => {
              // dragenter fires on arrival; dragover keeps firing while hovered,
              // resolving the hover once the swap cooldown ends.
              const onHoverTarget = (e: DragEvent<HTMLElement>) => {
                e.preventDefault();
                onGroupDragEnter(group, e.timeStamp);
              };
              return (
                <div key={group || "_ungrouped"}>
                  {group && (
                    <h3
                      ref={(el) => {
                        if (el) groupNodes.current.set(group, el);
                        else groupNodes.current.delete(group);
                      }}
                      draggable={editLayout}
                      onDragStart={
                        editLayout
                          ? (e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", group); // Firefox requires data
                              onGroupDragStart(group);
                            }
                          : undefined
                      }
                      onDragEnter={editLayout ? onHoverTarget : undefined}
                      onDragOver={editLayout ? onHoverTarget : undefined}
                      onDrop={editLayout ? (e) => e.preventDefault() : undefined}
                      onDragEnd={editLayout ? onGroupDragEnd : undefined}
                      title={editLayout ? "Drag to reorder groups" : undefined}
                      className={cn(
                        "mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                        editLayout &&
                          "w-fit cursor-grab px-1 select-none transition-[opacity,transform,scale] duration-200 ease-out active:cursor-grabbing",
                        dragGroup === group && "scale-95 opacity-40"
                      )}
                    >
                      {editLayout && <GripVertical className="size-3.5 text-muted-foreground/60" />}
                      {group}
                    </h3>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((t) => (
                      <TileCard
                        key={t.id}
                        tile={t}
                        health={health[t.id]}
                        reordering={editLayout}
                        isDragging={dragTileId === t.id}
                        nodeRef={(el) => {
                          if (el) tileNodes.current.set(t.id, el);
                          else tileNodes.current.delete(t.id);
                        }}
                        onReorderStart={onTileDragStart}
                        onReorderOver={onTileDragEnter}
                        onReorderEnd={onTileDragEnd}
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
              );
            })}
          </div>
        )}
      </section>

      {editingDevice && (
        <DeviceEditDialog
          key={`edit-${editingDevice.id}`}
          open={editDeviceOpen}
          onOpenChange={(open) => {
            setEditDeviceOpen(open);
            if (!open) {
              setEditingDevice(null);
              refreshDevices();
              refreshTiles();
            }
          }}
          device={editingDevice}
        />
      )}

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

      {headerSlot &&
        createPortal(
          <>
            {editLayout && (
              <p className="mr-auto text-xs text-muted-foreground">
                Editing layout — drag links, group headings, or device cards to reorder them
              </p>
            )}
            {!editLayout && (
              <p
                className="mr-auto hidden items-center gap-1 text-xs text-muted-foreground/70 sm:flex"
                title="Countdown to the next automatic refresh"
              >
                <RotateCw className="size-3" aria-hidden />
                devices <Countdown until={statusRefreshAt} className="tabular-nums" label="Next device usage refresh" />
                <span className="text-muted-foreground/40">·</span>
                links <Countdown until={healthRefreshAt} className="tabular-nums" label="Next link reachability refresh" />
              </p>
            )}
            {editLayout ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelLayoutEdit}>
                  <X data-icon="inline-start" className="size-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={() => setEditLayout(false)}>
                  <Check data-icon="inline-start" className="size-3.5" /> Done
                </Button>
              </>
            ) : (
              <>
                {visible !== null && visible.length > 0 && (
                  <Button variant="outline" size="sm" onClick={startLayoutEdit}>
                    <PencilLine data-icon="inline-start" className="size-3.5" />
                    <span className="hidden sm:inline">Edit layout</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setAddTab("link");
                    setAddOpen(true);
                  }}
                >
                  <Plus data-icon="inline-start" className="size-3.5" /> Add
                </Button>
              </>
            )}
          </>,
          headerSlot
        )}
    </div>
  );
}
