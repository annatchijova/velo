import { NextResponse } from "next/server";
import { loadAllCases } from "@/lib/corpus";

export async function GET() {
  return NextResponse.json(loadAllCases());
}
