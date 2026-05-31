import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { createUser } from "@/lib/db/users";

export async function POST(req: NextRequest) {
  try {
    const { email, password, role = "viewer" } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({ email, password });

    // Save role in Firestore
    await createUser(userRecord.uid, email, role);

    return NextResponse.json({ uid: userRecord.uid });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}