"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HiddenLinks } from "@/components/hidden-links";
import type { EnrichedTile } from "@/lib/tiles";
import { cn } from "@/lib/utils";

type SectionId = "hidden";

const SECTIONS: { id: SectionId; label: string; icon: typeof EyeOff }[] = [
  { id: "hidden", label: "Hidden links", icon: EyeOff },
];

/** Settings hub: sections on the left, the selected section's panel on the right. */
export default function SettingsPage() {
  const [tiles, setTiles] = useState<EnrichedTile[] | null>(null);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [section, setSection] = useState<SectionId>("hidden");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tiles");
      const data = (await res.json()) as { tiles: EnrichedTile[]; groupOrder: string[] };
      setTiles(data.tiles);
      setGroupOrder(data.groupOrder ?? []);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    // Initial load (setState happens asynchronously once data arrives).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const hidden = tiles?.filter((t) => t.hidden) ?? null;

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage Pier&apos;s behaviour and content.</p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label="Settings sections" className="shrink-0 md:w-52">
          <ul className="flex gap-2 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
            {SECTIONS.map((s) => {
              const active = s.id === section;
              const count = s.id === "hidden" ? hidden?.length : undefined;
              return (
                <li key={s.id} className="md:list-item">
                  <button
                    type="button"
                    onClick={() => setSection(s.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <s.icon className="size-4 shrink-0" />
                    <span className="truncate">{s.label}</span>
                    {count != null && count > 0 && (
                      <Badge variant="secondary" className="ml-auto shrink-0">
                        {count}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {section === "hidden" &&
            (hidden === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <HiddenLinks tiles={hidden} groups={groupOrder} onChanged={refresh} />
            ))}
        </div>
      </div>
    </div>
  );
}
