// lib/auth/middleware.ts
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getUser } from "@/lib/db/users";

type AuthSuccess = { uid: string; role: "admin" | "viewer" };
type AuthFailure = { error: string; status: number };

/** Verify the Bearer token and return the user's uid + role. */
export async function verifyToken(
  req: NextRequest
): Promise<AuthSuccess | AuthFailure> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing authorization header", status: 401 };
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userData = await getUser(decoded.uid);
    return {
      uid: decoded.uid,
      role: (userData?.role ?? "viewer") as "admin" | "viewer",
    };
  } catch {
    return { error: "Invalid or expired token", status: 401 };
  }
}

/** Return an error object if the caller is not an admin; null otherwise. */
export function requireAdmin(
  role: string
): { error: string; status: number } | null {
  if (role !== "admin") {
    return { error: "Admin access required", status: 403 };
  }
  return null;
}
