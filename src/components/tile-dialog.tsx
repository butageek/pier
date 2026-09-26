"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TileForm } from "@/components/tile-form";
import type { EnrichedTile } from "@/lib/tiles";

/** Edit dialog for an existing tile (manual or auto-discovered). */
export function TileDialog({
  open,
  onOpenChange,
  tile,
  groups,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tile: EnrichedTile | null;
  groups: string[];
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>
            {tile?.auto
              ? "Auto-discovered link — edits to title and icon are kept, but scans may refresh other fields."
              : "Update this link. Icon is matched automatically unless you pick one."}
          </DialogDescription>
        </DialogHeader>
        <TileForm
          key={tile?.id ?? "new"}
          tile={tile}
          groups={groups}
          onSaved={onSaved}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
