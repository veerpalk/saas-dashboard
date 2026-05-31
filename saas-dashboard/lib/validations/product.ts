// lib/validations/product.ts — Zod v4 compatible
import { z } from "zod";

export const productSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters"),
  category: z
    .string()
    .min(2, "Category must be at least 2 characters")
    .max(50, "Category must be under 50 characters"),
  price: z
    .number()
    .positive("Price must be positive")
    .max(1_000_000, "Price must be under 1,000,000"),
  status: z.enum(["active", "inactive"]),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
