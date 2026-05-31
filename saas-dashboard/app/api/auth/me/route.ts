import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/middleware";
import { getUser } from "@/lib/db/users";

export async function GET(req: NextRequest) {
  const user = await verifyToken(req);
  if ("error" in user) {
    return NextResponse.json({ error: user.error }, { status: user.status });
  }

  const userData = await getUser(user.uid);
  return NextResponse.json({ role: userData?.role ?? "viewer" });
}