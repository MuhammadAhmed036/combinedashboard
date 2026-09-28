"use client";

import React from "react";
import type { Camera } from "@/lib/types";
import { LeftRailContainer } from "./LeftRailContainer";

export function CustomizeWallRail({ cameras }: { cameras?: Camera[] }) {
  return <LeftRailContainer cameras={cameras} />;
}

export default CustomizeWallRail;
