// app/api/users/[id]/route.ts
import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyToken, requireAdmin } from "@/lib/auth/middleware";
import { updateUserRole } from "@/lib/db/users";

const roleSchema = z.object({
  role: z.enum(["admin", "viewer"]),
});

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/users/[id] — update role (admin only)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const adminCheck = requireAdmin(auth.role);
  if (adminCheck) {
    return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const { id } = await params;

  // Prevent admins from demoting themselves
  if (id === auth.uid) {
    return Response.json(
      { error: "You cannot change your own role" },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const parsed = roleSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid role. Must be 'admin' or 'viewer'" },
        { status: 422 }
      );
    }

    await updateUserRole(id, parsed.data.role);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/users/:id]", err);
    return Response.json({ error: "Failed to update user role" }, { status: 500 });
  }
}
