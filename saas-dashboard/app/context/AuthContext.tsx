"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

interface AuthContextType {
  user: User | null;
  role: "admin" | "viewer" | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"admin" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fires every time auth state changes (login, logout, page refresh)
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch role from our API (which reads Firestore)
        const token = await firebaseUser.getIdToken();
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setRole(data.role);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  
async function login(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();

  // Store token in a cookie for middleware to read
  document.cookie = `session=${token}; path=/; max-age=3600; SameSite=Strict`;
}

async function logout() {
  await signOut(auth);
  // Clear the session cookie
  document.cookie = "session=; path=/; max-age=0";
}
  async function getToken(): Promise<string> {
    if (!user) throw new Error("No user");
    return user.getIdToken();
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);