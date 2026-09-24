import Link from "next/link";
import type { Camera } from "@/lib/types";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { cn } from "@/lib/utils";

export function CameraCard({ camera }: { camera: Camera }) {
  return (
    <Link
      href={`/cameras/${encodeURIComponent(camera.id)}`}
      className="group overflow-hidden rounded-xl border border-surface-border bg-surface-2 transition-colors hover:border-primary/40"
    >
      <CameraThumbnail
        seed={camera.thumbnailSeed}
        feedUrl={camera.proxy_feed_url ?? camera.proxyFeedUrl}
        playerUrl={camera.playerUrl}
        offline={camera.status === "offline"}
        className="aspect-video w-full"
      >
        <span
          className={cn(
            "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white",
            camera.status === "online" ? "bg-status-active/90" : "bg-status-resolved/90"
          )}
        >
          {camera.status === "online" ? "LIVE" : "OFFLINE"}
        </span>
      </CameraThumbnail>
      <div className="p-3">
        <div className="truncate text-sm font-medium group-hover:text-primary">{camera.name}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {camera.code} · {camera.zoneName}
        </div>
      </div>
    </Link>
  );
}
