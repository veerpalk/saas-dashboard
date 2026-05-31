import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import ProductForm from "@/app/components/ProductForm";

export default function NewProductPage() {
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
        <h1 className="text-2xl font-bold text-blue-950">New Product</h1>
        <p className="muted-text text-sm mt-1">
          Fill in the details to add a new product to your catalogue.
        </p>
      </div>

      <div className="card-surface p-6">
        <ProductForm />
      </div>
    </div>
  );
}
