/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  /** Chosen slug, "" = auto. */
  value: string;
  onChange: (slug: string) => void;
  /** Extra labels (title, url...) used to suggest a match when none is chosen. */
  matchHints: string[];
};

type Result = { slug: string; url: string };

const CDN = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/png";

function InitialsFallback({ label }: { label: string }) {
  const text = (label || "?").trim().slice(0, 2).toUpperCase();
  return (
    <span className="flex size-full items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
      {text}
    </span>
  );
}

export function IconPreview({ slug, url, label }: { slug?: string; url?: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <InitialsFallback label={label} />;
  return (
    <img
      src={url}
      alt={slug ?? label}
      className="size-full rounded-lg object-contain p-1"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Searchable dashboard-icons picker with an "auto" option. */
export function IconPicker({ value, onChange, matchHints }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [suggestion, setSuggestion] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const qs = new URLSearchParams();
      if (query.trim()) qs.set("q", query.trim());
      else for (const h of matchHints.filter(Boolean).slice(0, 3)) qs.append("hint", h);
      try {
        const res = await fetch(`/api/icons?${qs.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (query.trim()) {
          setResults((data.results ?? []).slice(0, 24));
          setSuggestion(null);
        } else {
          setResults((data.results ?? []).slice(0, 12));
          setSuggestion(data.match ?? null);
        }
      } catch {
        /* ignore */
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, matchHints]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const chosen = value ? { slug: value, url: `${CDN}/${value}.png` } : null;
  const preview = chosen ?? suggestion;

  return (
    <div ref={boxRef} className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
          {preview ? <IconPreview key={preview.url} {...preview} label="?" /> : <InitialsFallback label="?" />}
        </div>
        <div className="min-w-0 flex-1">
          <Input
            placeholder="Search icons…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
          />
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {chosen ? (
              <>
                <button type="button" className="underline hover:text-foreground" onClick={() => onChange("")}>
                  clear
                </button>{" "}
                to auto-match ({suggestion ? `auto: ${suggestion.slug}` : "no match yet"})
              </>
            ) : suggestion ? (
              <>auto-match: {suggestion.slug}</>
            ) : (
              "no auto-match — search to pick one"
            )}
          </p>
        </div>
      </div>

      {open && results.length > 0 && (
        <ScrollArea className="h-44 rounded-lg border border-border bg-popover p-2">
          <div className="grid grid-cols-8 gap-1.5">
            {results.map((r) => (
              <button
                key={r.slug}
                type="button"
                title={r.slug}
                onClick={() => {
                  onChange(r.slug);
                  setOpen(false);
                }}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border border-transparent p-1 transition-colors hover:border-border hover:bg-muted",
                  value === r.slug && "border-primary bg-muted"
                )}
              >
                <img src={r.url} alt={r.slug} className="size-full object-contain" loading="lazy" />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
