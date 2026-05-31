// types/index.ts

export type Role = "admin" | "viewer";
export type ProductStatus = "active" | "inactive";

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  status: ProductStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}