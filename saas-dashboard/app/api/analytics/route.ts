// app/api/analytics/route.ts
import { type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/middleware";
import { getAdminDb } from "@/lib/firebase/admin";
import { Product } from "@/types";

// GET /api/analytics — aggregated KPIs + chart data (any authenticated user)
export async function GET(req: NextRequest) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const snapshot = await getAdminDb()
      .collection("products")
      .orderBy("createdAt", "asc")
      .get();

    const products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Product[];

    // ── KPIs ────────────────────────────────────────────────────────────────
    const total = products.length;
    const active = products.filter((p) => p.status === "active").length;
    const inactive = total - active;

    const categorySet = new Set(products.map((p) => p.category));
    const totalCategories = categorySet.size;

    const totalRevenue = products
      .filter((p) => p.status === "active")
      .reduce((sum, p) => sum + (p.price ?? 0), 0);

    // ── Products per category (bar chart) ──────────────────────────────────
    const categoryMap: Record<string, number> = {};
    for (const p of products) {
      categoryMap[p.category] = (categoryMap[p.category] ?? 0) + 1;
    }
    const byCategory = Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count,
    }));

    // ── Status breakdown (pie chart) ───────────────────────────────────────
    const statusBreakdown = [
      { name: "Active", value: active },
      { name: "Inactive", value: inactive },
    ];

    // ── Daily creations last 30 days (line chart) ──────────────────────────
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const dailyMap: Record<string, number> = {};
    // pre-fill last 30 days
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
      dailyMap[key] = 0;
    }

    for (const p of products) {
      const ts = toDate(p.createdAt);

      if (ts.getTime() >= thirtyDaysAgo) {
        const key = ts.toISOString().slice(0, 10);
        if (key in dailyMap) dailyMap[key]++;
      }
    }

    const dailyCreations = Object.entries(dailyMap).map(([date, count]) => ({
      date,
      count,
    }));

    return Response.json({
      kpis: { total, active, inactive, totalCategories, totalRevenue },
      byCategory,
      statusBreakdown,
      dailyCreations,
    });
  } catch (err) {
    console.error("[GET /api/analytics]", err);
    return Response.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

function toDate(value: Product["createdAt"]): Date {
  if (value instanceof Date) return value;
  const firestoreTs = value as { toDate?: () => Date };
  if (typeof firestoreTs.toDate === "function") return firestoreTs.toDate();
  return new Date(value);
}
