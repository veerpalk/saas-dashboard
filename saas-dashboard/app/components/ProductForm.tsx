"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import toast from "react-hot-toast";
import { productSchema } from "@/lib/validations/product";
import { Product } from "@/types";
import { useAuth } from "@/app/context/AuthContext";

type FormErrors = Partial<Record<keyof z.infer<typeof productSchema>, string[]>>;

interface ProductFormProps {
  /** When set, the form is in edit mode */
  initial?: Product;
}

const CATEGORIES = [
  "Software",
  "Hardware",
  "Service",
  "Subscription",
  "Analytics",
  "Security",
  "Infrastructure",
  "Other",
];

export default function ProductForm({ initial }: ProductFormProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [customCategory, setCustomCategory] = useState(
    initial?.category && !CATEGORIES.includes(initial.category)
      ? initial.category
      : ""
  );
  const [price, setPrice] = useState(initial?.price?.toString() ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    initial?.status ?? "active"
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const resolvedCategory =
    category === "Other" ? customCategory : category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = {
      name,
      category: resolvedCategory,
      price: parseFloat(price),
      status,
    };

    const parsed = productSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as FormErrors);
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      const url = isEdit ? `/api/products/${initial!.id}` : "/api/products";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.issues) {
          setErrors(data.issues as FormErrors);
        } else {
          toast.error(data.error ?? "Something went wrong");
        }
        return;
      }

      toast.success(isEdit ? "Product updated!" : "Product created!");
      router.push("/dashboard/products");
      router.refresh();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <Field label="Product Name" error={errors.name?.[0]}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Pro Analytics Suite"
          className={inputCls(!!errors.name)}
        />
      </Field>

      {/* Category */}
      <Field label="Category" error={errors.category?.[0]}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputCls(!!errors.category)}
        >
          <option value="" disabled>
            Select a category…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {category === "Other" && (
          <input
            type="text"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="Enter custom category"
            className={`mt-2 ${inputCls(!!errors.category)}`}
          />
        )}
      </Field>

      {/* Price */}
      <Field label="Price (USD)" error={errors.price?.[0]}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 text-sm">
            $
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className={`pl-6 ${inputCls(!!errors.price)}`}
          />
        </div>
      </Field>

      {/* Status */}
      <Field label="Status" error={errors.status?.[0]}>
        <div className="flex gap-3">
          {(["active", "inactive"] as const).map((s) => (
            <label
              key={s}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                status === s
                  ? s === "active"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-red-400 bg-red-50 text-red-600"
                  : "border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50/60"
              }`}
            >
              <input
                type="radio"
                name="status"
                value={s}
                checked={status === s}
                onChange={() => setStatus(s)}
                className="sr-only"
              />
              <span className={`w-2 h-2 rounded-full ${s === "active" ? "bg-emerald-500" : "bg-red-400"}`} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </label>
          ))}
        </div>
      </Field>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-blue-900">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return `w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
    hasError
      ? "border-red-300 bg-red-50/50 text-red-900 focus:ring-red-200"
      : "border-blue-200 bg-blue-50/70 text-blue-900 focus:ring-blue-500/25 focus:border-blue-400"
  }`;
}
