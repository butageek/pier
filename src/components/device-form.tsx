"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SafeDevice } from "@/lib/types";

/**
 * Device form: add a Docker-enabled server running pier-agent (then scan it
 * immediately), or edit an existing device's configuration. The agent reports
 * host stats from /proc and containers (with their published ports) via the
 * local Docker socket — each endpoint becomes a clickable tile.
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
  const initialPort = (() => {
    try {
      return new URL(device?.agent_url ?? "").port || "8080";
    } catch {
      return "8080";
    }
  })();

  const [name, setName] = useState(device?.name ?? "");
  const [host, setHost] = useState(device?.host ?? "");
  const [agentUrl, setAgentUrl] = useState(device?.agent_url ?? "");
  const [agentUrlTouched, setAgentUrlTouched] = useState(editing);
  const [agentKey, setAgentKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [cmdMode, setCmdMode] = useState<"run" | "compose">("run");
  const [showCmd, setShowCmd] = useState(true);
  const [port, setPort] = useState(initialPort);

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
    if (!agentUrlTouched) setAgentUrl(h ? `http://${h}:${p || "8080"}` : "");
  };

  const onHostChange = (value: string) => {
    setHost(value);
    syncAgentUrl(value, port);
  };

  const onPortChange = (value: string) => {
    setPort(value);
    syncAgentUrl(host, value);
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
        if (agentKey.trim()) body.agent_key = agentKey.trim(); // blank = keep current
        const res = await fetch(`/api/devices/${device.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save device");

        // Host/URL may have changed — rescan so endpoint links follow.
        let note = "";
        try {
          const scanRes = await fetch(`/api/devices/${device.id}/scan`, { method: "POST" });
          const scan = await scanRes.json();
          if (scanRes.ok) note = ` — ${scan.containersSeen} containers, +${scan.tilesCreated} links`;
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
        body: JSON.stringify({ name, host, agent_url: agentUrl, agent_key: agentKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add device");

      // Scan right away so tiles appear without an extra click.
      let scanNote = "";
      try {
        const scanRes = await fetch(`/api/devices/${data.device.id}/scan`, { method: "POST" });
        const scan = await scanRes.json();
        if (scanRes.ok) {
          scanNote =
            scan.containersSeen > 0
              ? ` — ${scan.containersSeen} containers, +${scan.tilesCreated} tiles`
              : " — no containers found";
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
  const canSubmit =
    !!name.trim() && !!host.trim() && validPort && !!agentUrl.trim() && (editing || !!agentKey.trim());

  return (
    <div className="space-y-4">
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
            <Label htmlFor="dev-port">Agent port</Label>
            <Input
              id="dev-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => onPortChange(e.target.value)}
              placeholder="8080"
            />
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="dev-agent-url">Agent URL</Label>
        <Input
          id="dev-agent-url"
          value={agentUrl}
          onChange={(e) => {
            setAgentUrlTouched(true);
            setAgentUrl(e.target.value);
          }}
          placeholder="http://192.168.1.10:8080"
        />
      </div>

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
          placeholder={editing ? "leave blank to keep the current key" : "must match PIER_KEY on the server"}
          autoComplete="off"
        />
      </div>

      {!editing && (
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
          {adding ? (editing ? "Saving…" : "Adding & scanning…") : editing ? "Save changes" : "Add device"}
        </Button>
      </div>
    </div>
  );
}
