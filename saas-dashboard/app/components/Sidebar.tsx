"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import toast from "react-hot-toast";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/dashboard/products", icon: Package },
];

const adminNavItems = [
  { label: "Users", href: "/dashboard/users", icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, logout, user } = useAuth();

  async function handleLogout() {
    try {
      await logout();
      router.push("/login");
    } catch {
      toast.error("Failed to log out");
    }
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 text-white shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-700">
        <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-sm">
          S
        </div>
        <span className="font-semibold text-sm tracking-wide">SaaS Dashboard</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {role === "admin" && (
          <>
            <div className="px-3 pt-4 pb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Admin
              </p>
            </div>
            {adminNavItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 border-t border-slate-700 pt-4 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold uppercase">
            {user?.email?.[0] ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.email}</p>
            <p className="text-[11px] text-slate-400 capitalize">{role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
}: {
  item: { label: string; href: string; icon: React.ElementType };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? "bg-blue-600 text-white font-medium"
          : "text-slate-300 hover:bg-slate-700 hover:text-white"
      }`}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
    </Link>
  );
}
