// app/api/users/route.ts
import { type NextRequest } from "next/server";
import { verifyToken, requireAdmin } from "@/lib/auth/middleware";
import { getAllUsers } from "@/lib/db/users";

// GET /api/users — list all users (admin only)
export async function GET(req: NextRequest) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const adminCheck = requireAdmin(auth.role);
  if (adminCheck) {
    return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  try {
    const users = await getAllUsers();
    return Response.json({ users });
  } catch (err) {
    console.error("[GET /api/users]", err);
    return Response.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
