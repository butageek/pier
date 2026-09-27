"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeviceForm } from "@/components/device-form";
import type { SafeDevice } from "@/lib/types";

/** Edit dialog for an existing device's configuration. */
export function DeviceEditDialog({
  open,
  onOpenChange,
  device,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: SafeDevice | null;
}) {
  if (!device) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit device</DialogTitle>
          <DialogDescription>
            Update the name, host or agent connection. Saving rescans the device so its links follow
            any host change.
          </DialogDescription>
        </DialogHeader>
        <DeviceForm
          key={`edit-device-${device.id}`}
          device={device}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
