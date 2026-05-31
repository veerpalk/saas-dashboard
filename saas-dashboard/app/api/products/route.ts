// app/api/products/route.ts
import { type NextRequest } from "next/server";
import { verifyToken, requireAdmin } from "@/lib/auth/middleware";
import { getAllProducts, createProduct } from "@/lib/db/products";
import { productSchema } from "@/lib/validations/product";

// GET /api/products — list all products (any authenticated user)
export async function GET(req: NextRequest) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const products = await getAllProducts();
    return Response.json({ products });
  } catch (err) {
    console.error("[GET /api/products]", err);
    return Response.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// POST /api/products — create a product (admin only)
export async function POST(req: NextRequest) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const adminCheck = requireAdmin(auth.role);
  if (adminCheck) {
    return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  try {
    const body = await req.json();
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const id = await createProduct(parsed.data, auth.uid);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/products]", err);
    return Response.json({ error: "Failed to create product" }, { status: 500 });
  }
}
