"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconPicker } from "@/components/icon-picker";
import { GroupSelect } from "@/components/group-select";
import type { EnrichedTile } from "@/lib/tiles";

/**
 * Tile form fields + save logic. Shared by the unified Add dialog (create)
 * and the tile edit dialog.
 */
export function TileForm({
  tile,
  groups,
  onSaved,
  onDone,
}: {
  tile: EnrichedTile | null;
  groups: string[];
  onSaved: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(tile?.title ?? "");
  const [url, setUrl] = useState(tile?.url ?? "");
  const [description, setDescription] = useState(tile?.description ?? "");
  const [group, setGroup] = useState(tile?.group_name ?? "");
  const [icon, setIcon] = useState(tile?.icon ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim() || !url.trim()) {
      setError("Title and URL are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(tile ? `/api/tiles/${tile.id}` : "/api/tiles", {
        method: tile ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, url, description, group, icon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSaved();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <IconPicker value={icon} onChange={setIcon} matchHints={[title, url]} />

      <div className="grid gap-2">
        <Label htmlFor="tile-title">Title</Label>
        <Input id="tile-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gitea" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tile-url">URL</Label>
        <Input
          id="tile-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://git.example.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="tile-desc">Description</Label>
          <Input
            id="tile-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div className="grid gap-2">
          <Label>Group</Label>
          <GroupSelect value={group} onChange={setGroup} groups={groups} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : tile ? "Save changes" : "Add link"}
        </Button>
      </div>
    </div>
  );
}
