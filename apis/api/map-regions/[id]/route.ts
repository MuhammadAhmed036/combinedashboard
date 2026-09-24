import { NextResponse } from "next/server";
import { deleteMapRegion } from "@/lib/server/mapRegionsStore";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = await deleteMapRegion(id);
    if (!deleted) {
      return NextResponse.json({ error: "Region not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete map region";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
