"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeviceForm } from "@/components/device-form";
import { TileForm } from "@/components/tile-form";

/**
 * Unified Add dialog: one entry point for both things you can add —
 * a manual link tile, or a device to auto-discover tiles from.
 */
export function AddDialog({
  open,
  onOpenChange,
  defaultTab = "link",
  groups,
  onSaved,
  onDeviceAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "link" | "device";
  groups: string[];
  onSaved: () => void;
  onDeviceAdded: () => void;
}) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Pier</DialogTitle>
          <DialogDescription>
            A link you manage yourself, or a Docker-enabled server to auto-discover links from.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1">
              Link
            </TabsTrigger>
            <TabsTrigger value="device" className="flex-1">
              Device
            </TabsTrigger>
          </TabsList>
          <TabsContent value="link" className="pt-4">
            <TileForm tile={null} groups={groups} onSaved={onSaved} onDone={close} />
          </TabsContent>
          <TabsContent value="device" className="pt-4">
            <DeviceForm onDone={() => { onDeviceAdded(); close(); }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
