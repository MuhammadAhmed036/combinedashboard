"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#a855f7", label: "Purple" },
];

export function SaveRegionModal({
  open,
  pointCount,
  onCancel,
  onSave,
  isSaving,
  error,
}: {
  open: boolean;
  pointCount: number;
  onCancel: () => void;
  onSave: (name: string, color: string) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);

  // Reset the form each time a fresh draft is presented for naming, rather
  // than carrying over whatever was typed for a previous region.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale input only at the moment the modal opens for a new draft.
      setName("");
      setColor(COLOR_OPTIONS[0].value);
    }
  }, [open]);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim(), color);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save Region</DialogTitle>
          <DialogDescription>
            {pointCount} point{pointCount === 1 ? "" : "s"} drawn — name this region and pick a
            color to save it permanently on the map.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="region-name">Region Name</Label>
          <Input
            id="region-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alert Zone"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                onClick={() => setColor(option.value)}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform",
                  color === option.value
                    ? "scale-110 border-foreground"
                    : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: option.value }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? "Saving…" : "Save Region"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
