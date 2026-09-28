// Shared types used by both server and client code.

export type Tile = {
  id: number;
  title: string;
  url: string;
  description: string;
  group_name: string;
  /** Explicit icon slug override; empty = auto-resolve. */
  icon: string;
  /** Set when the tile was auto-discovered from a device's Docker containers. */
  device_id: number | null;
  container_id: string | null;
  container_image: string;
  /** Container running state for auto tiles ("running", "exited", ...). */
  container_state: string;
  /** 1 = hidden from the dashboard (kept across scans; managed in Settings). */
  hidden: number;
  sort_order: number;
  created_at: string;
};

export type Device = {
  id: number;
  name: string;
  /** Host/IP used when building container endpoint URLs (http://host:port). */
  host: string;
  /** pier-agent endpoint on the server, e.g. http://192.168.1.10:8080 —
   *  or the Proxmox VE API base URL, e.g. https://192.168.1.10:8006. */
  agent_url: string;
  /** pier-agent shared key — or the PVE API token (user@realm!token=uuid). */
  agent_key: string;
  /** "docker" (pier-agent on the server) or "proxmox" (direct PVE API). */
  type?: "docker" | "proxmox";
  /** Cached scan result (DeviceScanInfo as JSON). */
  info: string;
  last_scan: string | null;
  created_at: string;
};

/** OS/runtime facts detected from the Docker Engine API. */
export type DeviceScanInfo = {
  os?: string;
  osType?: string;
  arch?: string;
  kernelVersion?: string;
  dockerVersion?: string;
  cpuCount?: number;
  memTotalBytes?: number;
  containers?: { running: number; paused: number; stopped: number };
  /** Proxmox VE only: PVE version and guest counts. */
  pveVersion?: string;
  guests?: { vms: number; lxc: number };
};

/** Device as exposed to the browser (agent key stripped). */
export type SafeDevice = Omit<Device, "agent_key">;

/** Live resource usage for a device. */
export type DeviceStatus = {
  online: boolean;
  error?: string;
  source: "agent" | "cache";
  cpuPct: number | null;
  memBytes: number | null;
  memLimitBytes: number | null;
  memPct: number | null;
  loadAvg: number[] | null;
  uptimeSec: number | null;
  runningContainers: number | null;
  /** Proxmox only: live per-guest stats from /cluster/resources. */
  guests?: PveGuestStatus[];
};

/** One Proxmox guest (VM or LXC) with live usage, as shown on the device card. */
export type PveGuestStatus = {
  /** Cluster-unique guest id: "qemu/101" / "lxc/104". */
  id: string;
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  status: string;
  cpuPct: number | null;
  memPct: number | null;
  memBytes: number | null;
  memMaxBytes: number | null;
  uptimeSec: number | null;
};

export type IconMatch = {
  slug: string;
  url: string;
};

export type ScanResult = {
  info: DeviceScanInfo;
  containersSeen: number;
  tilesCreated: number;
  tilesUpdated: number;
  tilesRemoved: number;
};

/** Endpoint reachability for a link, probed server-side (any HTTP response = up). */
export type TileHealth = {
  state: "up" | "down";
  /** HTTP status code of the probe (HEAD), null on network failure. */
  code: number | null;
  /** Round-trip latency in milliseconds, null on network failure. */
  ms: number | null;
  /** Short reason when the endpoint is unreachable ("timeout", "fetch failed", ...). */
  error?: string;
  /** Epoch ms of when the probe finished. */
  at: number;
};
