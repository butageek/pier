export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime();
  if (Number.isNaN(diff)) return "never";
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Map an OS/OSType string to a lucide icon-friendly hint + pretty label. */
export function osLabel(os: string | undefined, osType: string | undefined): string {
  const raw = os ?? osType ?? "";
  const l = raw.toLowerCase();
  if (l.includes("nixos")) return "NixOS";
  if (l.includes("ubuntu")) return "Ubuntu";
  if (l.includes("debian")) return "Debian";
  if (l.includes("raspbian")) return "Raspberry Pi OS";
  if (l.includes("alpine")) return "Alpine";
  if (l.includes("arch")) return "Arch";
  if (l.includes("fedora")) return "Fedora";
  if (l.includes("centos") || l.includes("rhel") || l.includes("red hat")) return "RHEL";
  if (l.includes("proxmox")) return "Proxmox VE";
  if (l.includes("truenas")) return "TrueNAS";
  if (l.includes("unraid")) return "Unraid";
  if (l.includes("windows")) return "Windows";
  if (osType === "linux" || l.includes("linux")) return "Linux";
  if (osType) return osType;
  return raw || "unknown";
}
