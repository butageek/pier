"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Device form: add a Docker-enabled server running pier-agent, then scan it
 * immediately. The agent reports host stats from /proc and containers (with
 * their published ports) via the local Docker socket — each endpoint becomes
 * a clickable tile.
 */
export function DeviceForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [agentUrlTouched, setAgentUrlTouched] = useState(false);
  const [agentKey, setAgentKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [cmdMode, setCmdMode] = useState<"run" | "compose">("run");
  const [showCmd, setShowCmd] = useState(true);
  const [port, setPort] = useState("8080");

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

  async function addDevice() {
    setAdding(true);
    setError("");
    try {
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
      setError(e instanceof Error ? e.message : "Failed to add device");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="dev-name">Name</Label>
        <Input id="dev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="homelab" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="dev-host">Host / IP</Label>
          <Input
            id="dev-host"
            value={host}
            onChange={(e) => onHostChange(e.target.value)}
            placeholder="192.168.1.10"
          />
        </div>
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
          placeholder="must match PIER_KEY on the server"
          autoComplete="off"
        />
      </div>

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={addDevice} disabled={adding || !name.trim() || !host.trim() || !agentUrl.trim() || !agentKey.trim()}>
          {adding ? "Adding & scanning…" : "Add device"}
        </Button>
      </div>
    </div>
  );
}
