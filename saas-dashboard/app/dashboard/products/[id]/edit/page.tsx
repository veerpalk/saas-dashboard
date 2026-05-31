"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import ProductForm from "@/app/components/ProductForm";
import { Product } from "@/types";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`/api/products/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Product not found");
        const data = await res.json();
        setProduct(data.product);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load product");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, getToken]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-8">
        <p className="text-red-500">{error || "Product not found"}</p>
        <Link href="/dashboard/products" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-6">
        <Link
          href="/dashboard/products"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </Link>
        <h1 className="text-2xl font-bold text-blue-950">Edit Product</h1>
        <p className="muted-text text-sm mt-1">
          Update the details for{" "}
          <span className="font-medium text-blue-800">{product.name}</span>.
        </p>
      </div>

      <div className="card-surface p-6">
        <ProductForm initial={product} />
      </div>
    </div>
  );
}
