"use client";

import { useState } from "react";
import { Server, Cpu, Container, Boxes, Monitor, RefreshCw, ArrowUpRight } from "lucide-react";
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
import type { DeviceScanInfo, DeviceStatus, PveGuestStatus, SafeDevice } from "@/lib/types";

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

/** Guests shown inline before the "+N more" expander. */
const GUESTS_INLINE = 5;

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

/** Collapsible guest list — capped inline so the card stays close to its neighbors' height. */
function GuestList({
  guests,
  deviceId,
  guestLinks,
}: {
  guests: PveGuestStatus[];
  deviceId: number;
  guestLinks?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? guests : guests.slice(0, GUESTS_INLINE);
  return (
    <div className="mt-3 space-y-1 border-t border-border/70 pt-2.5">
      {visible.map((g) => (
        <GuestRow key={g.id} guest={g} href={guestLinks?.[`${deviceId}|${g.id}`]} />
      ))}
      {guests.length > GUESTS_INLINE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "show less" : `+${guests.length - GUESTS_INLINE} more guests`}
        </button>
      )}
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
}: {
  device: SafeDevice;
  status: DeviceStatus | null;
  /** Proxmox only: "deviceId|guestId" -> discovered web URL, for clickable guest names. */
  guestLinks?: Record<string, string>;
  onScan: (device: SafeDevice) => void;
  onEdit: (device: SafeDevice) => void;
  onRemove: (device: SafeDevice) => void;
  scanning: boolean;
}) {
  const info = JSON.parse(device.info || "{}") as DeviceScanInfo;
  const isPve = device.type === "proxmox";
  const online = status?.online ?? true;
  const hasDocker = info.dockerVersion != null;
  const memPct =
    status?.memPct ??
    (info.memTotalBytes && status?.memBytes ? (status.memBytes / info.memTotalBytes) * 100 : null);
  const running = status?.runningContainers ?? info.containers?.running ?? null;

  return (
    <div className="group relative rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
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
      </div>

      <div className="mt-3 space-y-2.5">
        <Bar pct={status?.cpuPct ?? null} label="CPU" />
        <Bar
          pct={memPct}
          label={`RAM ${formatBytes(status?.memBytes)} / ${formatBytes(status?.memLimitBytes ?? info.memTotalBytes)}`}
        />
      </div>

      {isPve && status?.guests && status.guests.length > 0 && (
        <GuestList guests={status.guests} deviceId={device.id} guestLinks={guestLinks} />
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Cpu className="size-3" /> {info.cpuCount ?? "?"} cores
        </span>
        {(hasDocker || info.containers) && (
          <span className="inline-flex items-center gap-1">
            {isPve ? <Boxes className="size-3" /> : <Container className="size-3" />}
            {running ?? 0} running
            {info.containers?.stopped ? ` / ${info.containers.stopped} stopped` : ""}
          </span>
        )}
        {status?.uptimeSec != null && <span>up {formatUptime(status.uptimeSec)}</span>}
      </div>
    </div>
  );
}
