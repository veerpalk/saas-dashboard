// lib/db/users.ts
import { getAdminDb } from "@/lib/firebase/admin";
import { User } from "@/types";

export async function getUser(uid: string): Promise<User | null> {
  const doc = await getAdminDb().collection("users").doc(uid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as User;
}

export async function createUser(
  uid: string,
  email: string,
  role: "admin" | "viewer" = "viewer"
): Promise<void> {
  await getAdminDb().collection("users").doc(uid).set({
    email,
    role,
    createdAt: new Date(),
  });
}

export async function getAllUsers(): Promise<User[]> {
  const snapshot = await getAdminDb()
    .collection("users")
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as User));
}

export async function updateUserRole(
  uid: string,
  role: "admin" | "viewer"
): Promise<void> {
  await getAdminDb().collection("users").doc(uid).update({ role });
}
