"use client";

import { useState } from "react";
import { Check, ChevronDown, Container, Copy, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SafeDevice } from "@/lib/types";

type DeviceKind = "docker" | "proxmox";

/** Per-kind form defaults: agent port + URL scheme. */
const KIND_DEFAULTS: Record<DeviceKind, { port: string; scheme: string }> = {
  docker: { port: "8080", scheme: "http" },
  proxmox: { port: "8006", scheme: "https" },
};

/**
 * Device form: add a server to auto-discover links from (then scan it
 * immediately), or edit an existing device's configuration.
 *
 * - Docker: the server runs pier-agent — host stats from /proc and containers
 *   (with their published ports) via the local Docker socket.
 * - Proxmox VE: Pier talks to the PVE API directly with an API token; every
 *   VM/LXC guest becomes a console link, plus web links into running LXCs.
 */
export function DeviceForm({
  onDone,
  device,
}: {
  onDone: () => void;
  /** Pass a device to edit it instead of adding a new one. */
  device?: SafeDevice;
}) {
  const editing = !!device;
  const kind: DeviceKind = device?.type === "proxmox" ? "proxmox" : "docker";
  const [mode, setMode] = useState<DeviceKind>(kind); // add-mode picker; editing locks kind

  const activeKind = editing ? kind : mode;
  const pve = activeKind === "proxmox";
  const { port: defaultPort, scheme } = KIND_DEFAULTS[activeKind];

  const [name, setName] = useState(device?.name ?? "");
  const [host, setHost] = useState(device?.host ?? "");
  const [port, setPort] = useState(editing ? "" : defaultPort);
  const [portTouched, setPortTouched] = useState(editing);
  const [agentUrl, setAgentUrl] = useState(device?.agent_url ?? "");
  const [agentUrlTouched, setAgentUrlTouched] = useState(editing);
  const [agentKey, setAgentKey] = useState("");
  // Proxmox: the token is entered as its two PVE-dialog pieces and joined on
  // submit — a full "user@pve!token=uuid" pasted into the ID field also works.
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [cmdMode, setCmdMode] = useState<"run" | "compose">("run");
  const [showCmd, setShowCmd] = useState(true);
  const [showPveHelp, setShowPveHelp] = useState(true);

  const runCommand = `docker run -d --name pier-agent --restart unless-stopped \\
  -e PIER_KEY=${agentKey || "<key>"} -p ${port || "8080"}:8080 \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  ghcr.io/butageek/pier-agent`;

  const composeCommand = `services:
  pier-agent:
    image: ghcr.io/butageek/pier-agent
    container_name: pier-agent
    restart: unless-stopped
    ports:
      - "${port || "8080"}:8080"
    environment:
      PIER_KEY: ${agentKey || "<key>"}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock`;

  const activeCommand = cmdMode === "run" ? runCommand : composeCommand;

  const copyCommand = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(activeCommand);
      ok = true;
    } catch {
      // Insecure context (e.g. http://lan-ip) or denied permission — fall back.
      try {
        const ta = document.createElement("textarea");
        ta.value = activeCommand;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      toast.success(cmdMode === "run" ? "docker run command copied" : "Compose file copied");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy — select the command manually");
    }
  };

  const syncAgentUrl = (h: string, p: string) => {
    if (!agentUrlTouched) setAgentUrl(h ? `${scheme}://${h}:${p || defaultPort}` : "");
  };

  const onHostChange = (value: string) => {
    setHost(value);
    syncAgentUrl(value, port);
  };

  const onPortChange = (value: string) => {
    setPort(value);
    setPortTouched(true);
    syncAgentUrl(host, value);
  };

  // Switching the device kind re-bases the port + URL unless they were touched.
  const onKindChange = (next: DeviceKind) => {
    if (next === mode) return;
    setMode(next);
    const { port: nextPort, scheme: nextScheme } = KIND_DEFAULTS[next];
    if (!portTouched) setPort(nextPort);
    if (!agentUrlTouched && host) setAgentUrl(`${nextScheme}://${host}:${portTouched ? port : nextPort}`);
  };

  const generateKey = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    setAgentKey(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
  };

  async function saveDevice() {
    setAdding(true);
    setError("");
    try {
      if (editing) {
        const body: Record<string, string> = { name, host, agent_url: agentUrl };
        const nextKey = pve ? pveToken : agentKey.trim();
        if (nextKey) body.agent_key = nextKey; // blank = keep current
        const res = await fetch(`/api/devices/${device!.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save device");

        // Host/URL may have changed — rescan so endpoint links follow.
        let note = "";
        try {
          const scanRes = await fetch(`/api/devices/${device!.id}/scan`, { method: "POST" });
          const scan = await scanRes.json();
          if (scanRes.ok) {
            const noun = kind === "proxmox" ? "guests" : "containers";
            note = ` — ${scan.containersSeen} ${noun}, +${scan.tilesCreated} links`;
          }
        } catch {
          /* best-effort */
        }
        toast.success(`Updated ${data.device.name}${note}`);
        onDone();
        return;
      }

      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, host, agent_url: agentUrl, agent_key: pveToken || agentKey, type: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add device");

      // Scan right away so tiles appear without an extra click.
      let scanNote = "";
      try {
        const scanRes = await fetch(`/api/devices/${data.device.id}/scan`, { method: "POST" });
        const scan = await scanRes.json();
        if (scanRes.ok) {
          const noun = mode === "proxmox" ? "guests" : "containers";
          scanNote =
            scan.containersSeen > 0
              ? ` — ${scan.containersSeen} ${noun}, +${scan.tilesCreated} tiles`
              : " — nothing found";
        }
      } catch {
        /* scan is best-effort; device is saved either way */
      }
      toast.success(`Added ${data.device.name}${scanNote}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save device");
    } finally {
      setAdding(false);
    }
  }

  const validPort = editing || (/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536);
  const trimmedKey = agentKey.trim();
  const trimmedTokenId = tokenId.trim();
  const trimmedSecret = tokenSecret.trim();
  let pveToken = "";
  if (trimmedTokenId.includes("=")) {
    pveToken = trimmedTokenId; // a full user@pve!token=uuid was pasted into the ID field
  } else if (trimmedTokenId && trimmedSecret) {
    pveToken = `${trimmedTokenId}=${trimmedSecret}`;
  }
  // Agent keys are any shared secret; PVE tokens must be complete after joining.
  const validPveToken = pveToken.includes("@") && pveToken.includes("!") && pveToken.includes("=");
  const validKey = editing || (pve ? validPveToken : !!trimmedKey);
  const canSubmit = !!name.trim() && !!host.trim() && validPort && !!agentUrl.trim() && validKey;

  let submitLabel: string;
  if (editing) submitLabel = adding ? "Saving…" : "Save changes";
  else submitLabel = adding ? "Adding & scanning…" : "Add device";

  const keyPlaceholder = editing ? "leave blank to keep the current one" : "must match PIER_KEY on the server";

  const kindButton = (value: DeviceKind, label: string, Icon: typeof Server) => (
    <button
      key={value}
      type="button"
      onClick={() => onKindChange(value)}
      aria-pressed={mode === value}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
        mode === value
          ? "border-cyan-500/50 bg-cyan-500/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {!editing && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Device type">
          {kindButton("docker", "Docker server", Container)}
          {kindButton("proxmox", "Proxmox VE", Server)}
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="dev-name">Name</Label>
        <Input id="dev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="homelab" />
      </div>
      <div className={editing ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <div className="grid gap-2">
          <Label htmlFor="dev-host">Host / IP</Label>
          <Input
            id="dev-host"
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
            placeholder="192.168.1.10"
          />
        </div>
        {!editing && (
          <div className="grid gap-2">
            <Label htmlFor="dev-port">{pve ? "API port" : "Agent port"}</Label>
            <Input
              id="dev-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => onPortChange(e.target.value)}
              placeholder={defaultPort}
            />
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="dev-agent-url">{pve ? "Proxmox URL" : "Agent URL"}</Label>
        <Input
          id="dev-agent-url"
          value={agentUrl}
          onChange={(e) => {
            setAgentUrlTouched(true);
            setAgentUrl(e.target.value);
          }}
          placeholder={`${scheme}://192.168.1.10:${defaultPort}`}
        />
      </div>

      {pve ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="dev-token-id">Token ID</Label>
            <Input
              id="dev-token-id"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder={editing ? "leave blank to keep" : "pier@pve!pier"}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dev-token-secret">Token secret</Label>
            <Input
              id="dev-token-secret"
              value={tokenSecret}
              onChange={(e) => setTokenSecret(e.target.value)}
              placeholder={editing ? "leave blank to keep" : "00000000-0000-0000-0000-000000000000"}
              autoComplete="off"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="dev-agent-key">Access key</Label>
            <button
              type="button"
              onClick={generateKey}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              generate
            </button>
          </div>
          <Input
            id="dev-agent-key"
            value={agentKey}
            onChange={(e) => setAgentKey(e.target.value)}
            placeholder={keyPlaceholder}
            autoComplete="off"
          />
        </div>
      )}

      {!editing && pve && (
        <div className="rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowPveHelp((v) => !v)}
              aria-expanded={showPveHelp}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              <ChevronDown
                className={cn("size-3.5 shrink-0 transition-transform", showPveHelp && "rotate-180")}
              />
              <span className="truncate">Set up API access in PVE — 3 steps</span>
            </button>
          </div>
          {showPveHelp && (
            <div className="space-y-1.5 px-3 pb-3 leading-relaxed">
              <p>
                <strong>1.</strong> Create a user: <strong>Datacenter → Permissions → Users →
                Add</strong> with realm <strong>Proxmox VE authentication server</strong> (e.g.{" "}
                <span className="font-mono">pier</span>). The password is required but never used —
                Pier authenticates with the token only. (The default <em>Linux PAM</em> realm is for
                host system accounts; skip it.)
              </p>
              <p>
                <strong>2.</strong> Create a token: <strong>API Tokens → Add</strong> for that user,
                with <strong>Separate privileges unchecked</strong> — the token then inherits the
                user&apos;s (read-only) access. Copy the <span className="font-mono">Token ID</span> and{" "}
                <span className="font-mono">Secret</span> from the dialog into the two fields above;
                Pier joins them for you.
              </p>
              <p>
                <strong>3.</strong> Grant <strong>PVEAuditor</strong> on <span className="font-mono">/</span> to
                the user: Add → <strong>User Permission</strong>. Prefer a privilege-separated token
                anyway? Grant it to the <strong>token</strong> too — PVE intersects the two, and either
                half alone silently returns empty lists.
              </p>
              <p className="pt-1 text-muted-foreground/70">Or from the PVE shell:</p>
              <pre className="overflow-x-auto rounded-md bg-background/80 p-2 text-[10px] leading-relaxed text-foreground backdrop-blur">{`pveum user add pier@pve
pveum user token add pier@pve pier -privsep 0
pveum acl modify / -users pier@pve -roles PVEAuditor`}</pre>
            </div>
          )}
        </div>
      )}

      {!editing && !pve && (
        <div className="rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowCmd((v) => !v)}
              aria-expanded={showCmd}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", showCmd && "rotate-180")} />
              <span className="truncate">Deploy pier-agent — prebuilt image, just add the socket</span>
            </button>
            <div className="flex shrink-0 gap-1">
              {(["run", "compose"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setCmdMode(m);
                    setShowCmd(true);
                  }}
                  className={
                    m === cmdMode
                      ? "rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground backdrop-blur"
                      : "rounded-md px-2 py-0.5 text-[10px] text-muted-foreground/70 hover:text-foreground"
                  }
                >
                  {m === "run" ? "docker run" : "compose"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copyCommand}
              aria-label={cmdMode === "run" ? "Copy docker run command" : "Copy compose file"}
              title={cmdMode === "run" ? "Copy docker run command" : "Copy compose file"}
              className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </button>
          </div>
          {showCmd && (
            <pre className="overflow-x-auto px-3 pb-3 text-[11px] leading-relaxed text-foreground">{activeCommand}</pre>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={saveDevice} disabled={adding || !canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
