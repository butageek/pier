"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Server, Cpu, Container, Boxes, Monitor, RefreshCw, ArrowUpRight, GripVertical } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, formatUptime, osLabel, timeAgo } from "@/lib/format";
import { Countdown } from "@/components/use-countdown";
import type { ContainerStatus, DeviceScanInfo, DeviceStatus, PveGuestStatus, SafeDevice } from "@/lib/types";

function Bar({ pct, label }: { pct: number | null; label: string }) {
  const v = pct == null ? 0 : Math.min(pct, 100);
  const color = v < 60 ? "bg-emerald-500" : v < 85 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{pct == null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/** Popup width in px — kept in sync with the w-72 class below. */
const POPUP_WIDTH = 288;

/** "N running / M stopped" label for a Docker container list. */
function containerSummary(containers: ContainerStatus[]): string {
  const runningN = containers.filter((c) => c.state === "running").length;
  const stoppedN = containers.length - runningN;
  return `${runningN} running${stoppedN ? ` / ${stoppedN} stopped` : ""}`;
}

/**
 * A compact footer chip that opens a cursor-following popup. Hover to peek
 * (the popup tracks the mouse and stays open while hovered, so links inside
 * stay clickable); click or tap to pin it under the trigger; Esc or an
 * outside click closes it. Used for Proxmox guests and Docker containers.
 */
function CursorPopup({
  label,
  icon,
  title,
  refreshAt,
  children,
}: {
  label: string;
  icon: ReactNode;
  /** Popup heading, also the trigger's tooltip. */
  title: string;
  /** Epoch ms of the next data refresh — shown as "refreshes in Ns". */
  refreshAt?: number;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // cursor-follow position
  const [anchorPt, setAnchorPt] = useState<{ x: number; y: number } | null>(null); // pinned position
  const [pinned, setPinned] = useState(false);
  const hideTimer = useRef(0);

  const close = useCallback(() => {
    setPinned(false);
    setPos(null);
    setAnchorPt(null);
  }, []);
  const scheduleHide = useCallback(() => {
    hideTimer.current = window.setTimeout(close, 150);
  }, [close]);
  const cancelHide = useCallback(() => window.clearTimeout(hideTimer.current), []);
  useEffect(() => cancelHide, [cancelHide]);

  // Pinned popups close on Esc or a click outside (trigger + popup excluded).
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [pinned, close]);

  // Fixed position by the cursor, or at the point captured when pinned
  // (click/tap), clamped to the viewport. 340 ≈ max popup height + margin.
  const anchor = pos ?? (pinned ? anchorPt : null);
  let left = 0;
  let top = 0;
  if (anchor) {
    left = Math.max(8, Math.min(anchor.x + 14, window.innerWidth - POPUP_WIDTH - 8));
    top = Math.max(8, Math.min(anchor.y + 14, window.innerHeight - 340));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pinned || pos != null}
        title={title}
        className="inline-flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-4"
        onMouseEnter={cancelHide}
        onMouseMove={
          pinned
            ? undefined
            : (e) => {
                cancelHide();
                setPos({ x: e.clientX, y: e.clientY });
              }
        }
        onMouseLeave={pinned ? undefined : scheduleHide}
        onClick={() => {
          cancelHide();
          if (pinned) {
            close();
          } else {
            // Anchor under the trigger instead of following the cursor.
            const r = triggerRef.current?.getBoundingClientRect();
            if (r) setAnchorPt({ x: r.left - 14, y: r.bottom - 8 });
            setPos(null);
            setPinned(true);
          }
        }}
      >
        {icon}
        {label}
      </button>

      {(pinned || pos != null) &&
        createPortal(
          <div
            ref={popupRef}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            className="fixed z-50 max-h-80 w-72 animate-in fade-in-0 zoom-in-95 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl duration-100"
            style={{ left, top }}
          >
            <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {title}
            </p>
            <div className="space-y-1">{children}</div>
            {refreshAt != null && (
              <p className="mt-1.5 border-t border-border/60 px-1 pt-1.5 text-[10px] text-muted-foreground/70">
                refreshes in <Countdown until={refreshAt} className="tabular-nums" />
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/** One guest row on a Proxmox card: type icon, name, state, live CPU/RAM. */
function GuestRow({
  guest,
  href,
}: {
  guest: PveGuestStatus;
  /** Discovered web endpoint for this guest (if any) — makes the name clickable. */
  href?: string;
}) {
  const running = guest.status === "running";
  const title = running
    ? `CPU ${guest.cpuPct ?? "—"}% · RAM ${formatBytes(guest.memBytes)} / ${formatBytes(guest.memMaxBytes)} · up ${formatUptime(guest.uptimeSec)}`
    : guest.status;
  return (
    <div className="flex items-center gap-2 text-xs" title={title}>
      {guest.type === "lxc" ? (
        <Container className="size-3 shrink-0 text-muted-foreground" />
      ) : (
        <Monitor className="size-3 shrink-0 text-muted-foreground" />
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 font-medium text-cyan-600 hover:underline dark:text-cyan-400"
        >
          <span className="truncate">{guest.name}</span>
          <ArrowUpRight className="size-3 shrink-0" aria-hidden />
        </a>
      ) : (
        <span className="truncate">{guest.name}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {running ? (
          <>
            <span className="size-1.5 rounded-full bg-emerald-500" aria-label="running" />
            <span className="tabular-nums text-muted-foreground">
              {guest.cpuPct ?? "—"}% · {guest.memPct ?? "—"}%
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/70">{guest.status}</span>
        )}
      </span>
    </div>
  );
}
/** One container row in the Docker device popup, mirroring GuestRow: state
 *  dot, name (clickable when an endpoint was discovered), live CPU/RAM% on
 *  the right ("—" on agents that predate per-container stats). */
function ContainerRow({ container, href }: { container: ContainerStatus; href?: string }) {
  const running = container.state === "running";
  const title = running
    ? `CPU ${container.cpuPct ?? "—"}% · RAM ${container.memPct ?? "—"}% · ${container.image}`
    : `${container.state} · ${container.image}`;
  return (
    <div className="flex items-center gap-2 text-xs" title={title}>
      <Container className="size-3 shrink-0 text-muted-foreground" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1 font-medium text-cyan-600 hover:underline dark:text-cyan-400"
        >
          <span className="truncate">{container.name}</span>
          <ArrowUpRight className="size-3 shrink-0" aria-hidden />
        </a>
      ) : (
        <span className="truncate">{container.name}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {running ? (
          <>
            <span className="size-1.5 rounded-full bg-emerald-500" aria-label="running" />
            <span className="tabular-nums text-muted-foreground">
              {container.cpuPct ?? "—"}% · {container.memPct ?? "—"}%
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/70">{container.state}</span>
        )}
      </span>
    </div>
  );
}

export function DeviceCard({
  device,
  status,
  guestLinks,
  onScan,
  onEdit,
  onRemove,
  scanning,
  nextRefreshAt,
  reordering = false,
  isDragging = false,
  nodeRef,
  onReorderStart,
  onReorderOver,
  onReorderEnd,
}: {
  device: SafeDevice;
  status: DeviceStatus | null;
  /** Proxmox only: "deviceId|guestId" -> discovered web URL, for clickable guest names. */
  guestLinks?: Record<string, string>;
  onScan: (device: SafeDevice) => void;
  onEdit: (device: SafeDevice) => void;
  onRemove: (device: SafeDevice) => void;
  scanning: boolean;
  /** Epoch ms of the next scheduled usage refresh — shown as a countdown. */
  nextRefreshAt?: number;
  /** Layout-edit mode: the card becomes a drag handle (actions hidden). */
  reordering?: boolean;
  isDragging?: boolean;
  /** Registers the card root for FLIP slide animations (see useFlipReorder). */
  nodeRef?: (el: HTMLDivElement | null) => void;
  onReorderStart?: (device: SafeDevice) => void;
  /** Fires on dragenter/dragover; `at` is the event's monotonic timeStamp. */
  onReorderOver?: (device: SafeDevice, at: number) => void;
  onReorderEnd?: () => void;
}) {
  const info = JSON.parse(device.info || "{}") as DeviceScanInfo;
  const isPve = device.type === "proxmox";
  const online = status?.online ?? true;
  const hasDocker = info.dockerVersion != null;
  const memPct =
    status?.memPct ??
    (info.memTotalBytes && status?.memBytes ? (status.memBytes / info.memTotalBytes) * 100 : null);
  const running = status?.runningContainers ?? info.containers?.running ?? null;

  // dragenter fires on arrival; dragover keeps firing while hovered, resolving
  // the hover once the swap cooldown ends.
  const onHoverTarget = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onReorderOver?.(device, e.timeStamp);
  };

  return (
    <div
      ref={nodeRef}
      title={reordering ? "Drag to reorder" : undefined}
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition-[opacity,transform,scale] duration-200 ease-out",
        reordering
          ? "cursor-grab border-dashed border-border select-none active:cursor-grabbing"
          : "border-border/70",
        isDragging && "scale-95 opacity-40"
      )}
      draggable={reordering}
      onDragStart={
        reordering
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(device.id)); // Firefox requires data
              onReorderStart?.(device);
            }
          : undefined
      }
      onDragEnter={reordering ? onHoverTarget : undefined}
      onDragOver={reordering ? onHoverTarget : undefined}
      onDrop={reordering ? (e) => e.preventDefault() : undefined}
      onDragEnd={reordering ? () => onReorderEnd?.() : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {reordering && <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" />}
            <Server className="size-4 shrink-0 text-cyan-400" />
            <span className="truncate text-sm font-semibold">{device.name}</span>
            <Badge variant={online ? "secondary" : "destructive"} className="px-1.5 text-[10px]">
              {online ? (isPve ? "pve" : "agent") : "offline"}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {isPve ? (
              <>
                Proxmox VE{info.pveVersion ? ` ${info.pveVersion}` : ""}
                {info.guests ? ` · ${info.guests.vms} VMs · ${info.guests.lxc} LXC` : ""} ·{" "}
                <span>{device.host}</span>
              </>
            ) : (
              <>
                {osLabel(info.os, info.osType)}
                {info.dockerVersion ? ` · Docker ${info.dockerVersion}` : " · no docker"} ·{" "}
                <span>{device.host}</span>
              </>
            )}
          </p>
        </div>
        {!reordering && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              title={`Scanned ${timeAgo(device.last_scan)}`}
              onClick={() => onScan(device)}
              disabled={scanning}
            >
              <RefreshCw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} />
            </Button>
            <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  aria-label="Device actions"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => onScan(device)} disabled={scanning}>
                    Scan now
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(device)}>Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onRemove(device)}>
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        <Bar pct={status?.cpuPct ?? null} label="CPU" />
        <Bar
          pct={memPct}
          label={`RAM ${formatBytes(status?.memBytes)} / ${formatBytes(status?.memLimitBytes ?? info.memTotalBytes)}`}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Cpu className="size-3" /> {info.cpuCount ?? "?"} cores
        </span>
        {isPve && status?.guests && status.guests.length > 0 ? (
          reordering ? (
            <span className="inline-flex items-center gap-1">
              <Boxes className="size-3" /> {status.guests.length} guests
            </span>
          ) : (
            <CursorPopup
              label={`${status.guests.length} guests`}
              icon={<Boxes className="size-3" />}
              title="VMs & containers"
              refreshAt={nextRefreshAt}
            >
              {status.guests.map((g) => (
                <GuestRow key={g.id} guest={g} href={guestLinks?.[`${device.id}|${g.id}`]} />
              ))}
            </CursorPopup>
          )
        ) : status?.containers && status.containers.length > 0 ? (
          reordering ? (
            <span className="inline-flex items-center gap-1">
              <Container className="size-3" /> {containerSummary(status.containers)}
            </span>
          ) : (
            <CursorPopup
              label={containerSummary(status.containers)}
              icon={<Container className="size-3" />}
              title="Containers"
              refreshAt={nextRefreshAt}
            >
              {status.containers.map((c) => (
                <ContainerRow key={c.id} container={c} href={guestLinks?.[`${device.id}|${c.id}`]} />
              ))}
            </CursorPopup>
          )
        ) : (
          (hasDocker || info.containers) && (
            <span className="inline-flex items-center gap-1">
              {isPve ? <Boxes className="size-3" /> : <Container className="size-3" />}
              {running ?? 0} running
              {info.containers?.stopped ? ` / ${info.containers.stopped} stopped` : ""}
            </span>
          )
        )}
        {status?.uptimeSec != null && <span>up {formatUptime(status.uptimeSec)}</span>}
        {!reordering && nextRefreshAt != null && (
          <Countdown
            until={nextRefreshAt}
            label="Next usage refresh"
            className="tabular-nums text-muted-foreground/60"
          />
        )}
      </div>
    </div>
  );
}
