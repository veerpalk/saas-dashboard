// app/api/products/[id]/route.ts
import { type NextRequest } from "next/server";
import { verifyToken, requireAdmin } from "@/lib/auth/middleware";
import { getProduct, updateProduct, deleteProduct } from "@/lib/db/products";
import { productUpdateSchema } from "@/lib/validations/product";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/products/[id] — get a single product (any authenticated user)
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const product = await getProduct(id);
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  return Response.json({ product });
}

// PUT /api/products/[id] — update a product (admin only)
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const adminCheck = requireAdmin(auth.role);
  if (adminCheck) {
    return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = productUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const existing = await getProduct(id);
    if (!existing) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    await updateProduct(id, parsed.data);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[PUT /api/products/:id]", err);
    return Response.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// DELETE /api/products/[id] — delete a product (admin only)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const adminCheck = requireAdmin(auth.role);
  if (adminCheck) {
    return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const { id } = await params;

  try {
    const existing = await getProduct(id);
    if (!existing) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    await deleteProduct(id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/products/:id]", err);
    return Response.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
