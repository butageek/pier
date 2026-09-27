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
  /** pier-agent endpoint on the server, e.g. http://192.168.1.10:8080 */
  agent_url: string;
  agent_key: string;
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
