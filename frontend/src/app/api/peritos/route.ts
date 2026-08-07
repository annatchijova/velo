import { NextResponse } from "next/server";
import { loadAllPeritos } from "@/lib/corpus";

export async function GET() {
  return NextResponse.json(loadAllPeritos());
}
