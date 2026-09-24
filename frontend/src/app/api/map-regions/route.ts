import { NextRequest, NextResponse } from "next/server";
import { createMapRegion, listMapRegions } from "@/lib/server/mapRegionsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const regions = await listMapRegions();
    return NextResponse.json(regions, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load map regions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isValidCoordinates(value: unknown): value is [number, number][] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number"
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const color = typeof body?.color === "string" ? body.color.trim() : "";
    const coordinates = body?.coordinates;

    if (!name) {
      return NextResponse.json({ error: "Region name is required" }, { status: 400 });
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "Color must be a hex value like #ef4444" }, { status: 400 });
    }
    if (!isValidCoordinates(coordinates)) {
      return NextResponse.json(
        { error: "A region needs at least 3 [lng, lat] points" },
        { status: 400 }
      );
    }

    const region = await createMapRegion({ name, color, coordinates });
    return NextResponse.json(region, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create map region";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
