import fs from "node:fs";
import path from "node:path";
import type { IconMatch } from "./types";

/**
 * Icon resolution against homarr-labs/dashboard-icons (PNG variants).
 *
 * We never clone the icon repo. The full list of available slugs is fetched
 * from the GitHub git-trees API, cached on disk (data/icon-index.json) and
 * refreshed weekly. Icons are served straight from the jsDelivr CDN, with a
 * bundled seed list as offline fallback so matching works on first run.
 */

const ICON_INDEX_PATH = path.join(process.cwd(), "data", "icon-index.json");
const TREES_URL = "https://api.github.com/repos/homarr-labs/dashboard-icons/git/trees/main?recursive=1";
const CDN_BASE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/png";
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const IN_MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Icons shipped with Pier itself (served from public/, no CDN involved).
 * Lets links pointing at Pier resolve to the real Pier mark — the CDN index
 * doesn't know this project — and gives users a stable URL to grab it from
 * (GET /pier.png, GET /pier.svg).
 */
const BUILTIN_ICONS: Record<string, string> = {
  pier: "/pier.png",
};

type IconIndex = { fetchedAt: number; slugs: string[] };

/** ~130 of the most common self-hosted services; used until the first online refresh. */
const SEED_SLUGS = [
  "adguard-home","airsonic","alertmanager","ansible","argo-cd","audiobookshelf","authelia","authentik",
  "bazarr","bitwarden","bookstack","calibre-web","changedetection","chartmuseum","code-server","codimd",
  "caddy","castopod","cockpit","concourse","consul","crowdsec","cyberchef","deluge",
  "dokuwiki","dolibarr","domoticz","duplicati","element","emby","filebrowser","firefly-iii","flame",
  "freshrss","gitea","github","gitlab","glances","glpi","grafana","grist","grocy","guacamole","harbor",
  "hadoop","headphones","headscale","heimdall","home-assistant","homepage","homer","hortusfox","immich",
  "influxdb","jackett","jellyfin","jellyseerr","jenkins","jira","jitsi","kasm","kavita","keycloak",
  "kitchenowl","kopia","kubernetes","lanraragi","libreddit","librenms","lidarr","linkding","linkwarden",
  "loki","longhorn","lychee","mailcow","mailhog","mariadb","mastodon","matrix","mealie","mediawiki",
  "memcached","miniflux","minio","mongodb","monit","motioneye","mylar3","n8n",
  "navidrome","netbox","netdata","nextcloud","nextdns","nginx","nginx-proxy-manager","nocodb","nodered",
  "nzbget","nzbhydra","octoprint","odoo","omada","ombi","openhab","openmediavault","openvpn","opnsense",
  "organizr","outline","overseerr","owncloud","paperless-ngx","partkeepr","peertube","photonix","photoprism",
  "pi-hole","piwigo","plex","portainer","postiz","prometheus","protonmail-bridge","proxmox","prowlarr",
  "pve","pyload","qbittorrent","rabbitmq","radarr","raspberry-pi","recalbox","redis","rundeck","rutorrent",
  "sabnzbd","scrutiny","searxng","selenium","serviio","sickchill","smokeping","sonarr","speedtest-tracker",
  "splunk","spotweb","syncthing","tautulli","tdarr","technitium","theia",
  "tinytinyrss","traefik","transmission","truenas","twingate","ubiquiti-unifi","unifi","unraid","uptime-kuma",
  "vaultwarden","vikunja","watchtower","whoogle","wikijs","woodpecker-ci","wordpress","yacht","yarr",
  "zabbix","zigbee2mqtt","znc","zoraxy","zwave-js-ui",
];

/** A few well-known mismatches between image/name and icon slug. */
const ALIASES: Record<string, string> = {
  homeassistant: "home-assistant",
  homeassistant_ce: "home-assistant",
  hass: "home-assistant",
  pihole: "pi-hole",
  unificontroller: "unifi",
  unifi_controller: "unifi",
  omv: "openmediavault",
  npm: "nginx-proxy-manager",
  nginxpm: "nginx-proxy-manager",
  nginx_proxy_manager: "nginx-proxy-manager",
  paperless: "paperless-ngx",
  prom: "prometheus",
  grafana_cloud: "grafana",
  z2m: "zigbee2mqtt",
};

let cache: { at: number; index: IconIndex } | null = null;
let refreshPromise: Promise<IconIndex> | null = null;

export async function getIconIndex(): Promise<IconIndex> {
  if (cache && Date.now() - cache.at < IN_MEMORY_TTL_MS) return cache.index;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    let index = readIndexFromDisk();
    const stale = !index || Date.now() - index.fetchedAt > REFRESH_AFTER_MS;
    if (stale) {
      const fresh = await fetchIndexFromGithub();
      if (fresh) {
        index = fresh;
        writeIndexToDisk(fresh);
      }
    }
    const finalIndex: IconIndex = index ?? { fetchedAt: 0, slugs: SEED_SLUGS };
    cache = { at: Date.now(), index: finalIndex };
    return finalIndex;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function readIndexFromDisk(): IconIndex | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(ICON_INDEX_PATH, "utf8")) as IconIndex;
    return Array.isArray(parsed.slugs) && parsed.slugs.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeIndexToDisk(index: IconIndex) {
  try {
    fs.mkdirSync(path.dirname(ICON_INDEX_PATH), { recursive: true });
    fs.writeFileSync(ICON_INDEX_PATH, JSON.stringify(index));
  } catch {
    // non-fatal: in-memory cache still works
  }
}

async function fetchIndexFromGithub(): Promise<IconIndex | null> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    const res = await fetch(TREES_URL, {
      signal: ac.signal,
      headers: { accept: "application/vnd.github+json", "user-agent": "pier-dashboard" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const tree = (await res.json()) as { truncated?: boolean; tree?: { path: string; type: string }[] };
    if (tree.truncated) return null;
    const slugs = (tree.tree ?? [])
      .filter((e) => e.type === "blob" && e.path.startsWith("png/") && e.path.endsWith(".png"))
      .map((e) => e.path.slice("png/".length, -".png".length))
      .sort();
    return slugs.length > 100 ? { fetchedAt: Date.now(), slugs } : null;
  } catch {
    return null;
  }
}

export function iconUrl(slug: string): string {
  return BUILTIN_ICONS[slug] ?? `${CDN_BASE}/${slug}.png`;
}

/** Normalize any label into kebab-case for slug comparison. */
export function normalizeLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Base name(s) to try from a docker image reference: last path segment first. */
export function imageCandidates(image: string): string[] {
  const noTag = image.split(/[@:]/)[0];
  const noRegistry = noTag.includes("/") && !noTag.split("/")[0].includes(".") ? noTag : noTag.split("/").slice(1).join("/");
  const segments = noRegistry.split("/").filter(Boolean).filter((s) => s !== "library");
  const last = segments[segments.length - 1] ?? "";
  const full = segments.join("-");
  return [last, full].filter(Boolean);
}

/**
 * Resolve the best icon for a tile. Candidates are tried in order:
 * explicit label, docker image base names, tile title, url hostname.
 * Exact slug match wins; then substring matches (longest candidate first).
 * Light/dark variants are only used when the base icon doesn't exist.
 */
export async function resolveIcon(candidates: string[]): Promise<IconMatch | null> {
  const { slugs } = await getIconIndex();
  const set = new Set(slugs);

  const normed = candidates
    .filter(Boolean)
    .map((c) => normalizeLabel(c))
    .filter((c) => c.length >= 2);

  // 1) exact matches (after alias mapping) — built-in icons win over the CDN
  for (const c of [...normed].reverse()) {
    for (const cand of [ALIASES[c] ?? c, c]) {
      if (cand in BUILTIN_ICONS || set.has(cand)) return { slug: cand, url: iconUrl(cand) };
    }
  }

  // 2) token match: candidate and slug share a hyphen-delimited token
  //    ("Jellyfin Media" -> "jellyfin-media" matches slug "jellyfin")
  const byLen = [...normed].sort((a, b) => b.length - a.length);
  {
    let best: string | null = null;
    for (const cand of byLen) {
      if (cand.length < 3) continue;
      const candTokens = new Set(cand.split("-").filter((t) => t.length >= 3));
      for (const slug of set) {
        if (slug.endsWith("-light") || slug.endsWith("-dark")) continue;
        const slugTokens = slug.split("-");
        if (slugTokens.some((t) => candTokens.has(t))) {
          if (!best || slug.length < best.length) best = slug;
        }
      }
    }
    if (best) return { slug: best, url: iconUrl(best) };
  }

  // 3) substring matches — only for reasonably long candidates to avoid
  //    nonsense like "old" matching "folder"
  for (const cand of byLen) {
    if (cand.length < 4) continue;
    let best: string | null = null;
    for (const slug of set) {
      if (slug.endsWith("-light") || slug.endsWith("-dark")) continue;
      if (slug.includes(cand) || cand.includes(slug)) {
        if (!best || slug.length < best.length) best = slug;
      }
    }
    if (best) return { slug: best, url: iconUrl(best) };
  }

  return null;
}

/** Search available slugs for the icon picker (built-ins included first). */
export async function searchSlugs(q: string, limit = 30): Promise<string[]> {
  const { slugs } = await getIconIndex();
  const all = [...Object.keys(BUILTIN_ICONS), ...slugs];
  const query = normalizeLabel(q);
  if (!query) return all.slice(0, limit);
  const starts: string[] = [];
  const includes: string[] = [];
  for (const s of all) {
    if (s.startsWith(query)) starts.push(s);
    else if (s.includes(query)) includes.push(s);
    if (starts.length >= limit) break;
  }
  return [...starts, ...includes].slice(0, limit);
}
