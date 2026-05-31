// lib/db/products.ts
import { getAdminDb } from "@/lib/firebase/admin";
import { Product } from "@/types";

const COL = "products";

// Get all products
export async function getAllProducts(): Promise<Product[]> {
  const snapshot = await getAdminDb()
    .collection(COL)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Product[];
}

// Get a single product
export async function getProduct(id: string): Promise<Product | null> {
  const doc = await getAdminDb().collection(COL).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Product;
}

// Create a product
export async function createProduct(
  data: Omit<Product, "id" | "createdAt" | "updatedAt" | "createdBy">,
  userId: string
): Promise<string> {
  const ref = await getAdminDb().collection(COL).add({
    ...data,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return ref.id;
}

// Update a product
export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, "id" | "createdAt" | "createdBy">>
): Promise<void> {
  await getAdminDb().collection(COL).doc(id).update({
    ...data,
    updatedAt: new Date(),
  });
}

// Delete a product
export async function deleteProduct(id: string): Promise<void> {
  await getAdminDb().collection(COL).doc(id).delete();
}