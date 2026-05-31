"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, User as UserIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/context/AuthContext";
import { User } from "@/types";

export default function UsersPage() {
  const { role: currentRole, user: currentUser, getToken } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (currentRole && currentRole !== "admin") {
      router.replace("/dashboard");
      return;
    }
    if (currentRole !== "admin") return;

    let cancelled = false;

    async function loadUsers() {
      try {
        const token = await getToken();
        const res = await fetch("/api/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setUsers(data.users);
      } catch {
        if (!cancelled) toast.error("Failed to load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [currentRole, router, getToken]);

  async function toggleRole(user: User) {
    const newRole = user.role === "admin" ? "viewer" : "admin";

    if (user.id === currentUser?.uid) {
      toast.error("You cannot change your own role");
      return;
    }

    setUpdating(user.id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update role");
      }
      toast.success(`${user.email} is now a ${newRole}`);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setUpdating(null);
    }
  }

  if (currentRole !== "admin") return null;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage team members and their roles.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Joined
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isSelf = user.id === currentUser?.uid;
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-500 uppercase shrink-0">
                          {user.email[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{user.email}</p>
                          {isSelf && (
                            <p className="text-xs text-slate-400">You</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          user.role === "admin"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.role === "admin" ? (
                          <ShieldCheck className="w-3 h-3" />
                        ) : (
                          <UserIcon className="w-3 h-3" />
                        )}
                        {user.role}
                      </span>
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleRole(user)}
                        disabled={isSelf || updating === user.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          user.role === "admin"
                            ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                            : "border-purple-200 text-purple-700 hover:bg-purple-50"
                        }`}
                        title={isSelf ? "You cannot change your own role" : undefined}
                      >
                        {updating === user.id
                          ? "Saving…"
                          : user.role === "admin"
                          ? "Demote to Viewer"
                          : "Promote to Admin"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400">
        {users.length} user{users.length !== 1 ? "s" : ""} ·{" "}
        New users are created via the registration endpoint and default to the{" "}
        <span className="font-medium">viewer</span> role.
      </p>
    </div>
  );
}

function formatDate(val: unknown): string {
  if (!val) return "—";
  try {
    const d =
      val instanceof Date
        ? val
        : typeof (val as { toDate?: () => Date }).toDate === "function"
        ? (val as { toDate: () => Date }).toDate()
        : new Date(val as string);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}
