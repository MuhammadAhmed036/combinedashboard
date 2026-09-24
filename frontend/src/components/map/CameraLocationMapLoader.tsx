"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { CameraLocationMapProps } from "@/components/map/CameraLocationMap";

const CameraLocationMapInner = dynamic(
  () => import("@/components/map/CameraLocationMap").then((mod) => mod.CameraLocationMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-xl" />,
  }
);

export function CameraLocationMapLoader(props: CameraLocationMapProps) {
  return <CameraLocationMapInner {...props} />;
}
