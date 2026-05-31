"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/app/context/AuthContext";
import { Product } from "@/types";

const columnHelper = createColumnHelper<Product>();

export default function ProductsPage() {
  const { role, getToken } = useAuth();
  const isAdmin = role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setProducts(data.products);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("Product deleted");
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error("Failed to delete product");
    } finally {
      setDeleting(null);
    }
  }

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => (
        <span className="font-medium text-slate-900">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("category", {
      header: "Category",
      cell: (info) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("price", {
      header: "Price",
      cell: (info) => (
        <span className="font-mono text-sm">
          ${Number(info.getValue()).toFixed(2)}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const s = info.getValue();
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              s === "active"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {s}
          </span>
        );
      },
      filterFn: "equals",
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) =>
        isAdmin ? (
          <div className="flex items-center gap-2 justify-end">
            <Link
              href={`/dashboard/products/${row.original.id}/edit`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </Link>
            <button
              onClick={() => handleDelete(row.original.id, row.original.name)}
              disabled={deleting === row.original.id}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : null,
    }),
  ];

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table API
  const table = useReactTable({
    data: products,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const statusFilterValue = (columnFilters.find((f) => f.id === "status")?.value as string) ?? "";

  function setStatusFilter(val: string) {
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "status");
      return val ? [...others, { id: "status", value: val }] : others;
    });
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-slate-500 text-sm mt-1">
            {products.length} product{products.length !== 1 ? "s" : ""} total
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/dashboard/products/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Product
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Global search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search products…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-60"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilterValue}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400 text-sm">No products found.</p>
            {isAdmin && (
              <Link
                href="/dashboard/products/new"
                className="mt-3 inline-flex items-center gap-1.5 text-blue-600 text-sm font-medium hover:underline"
              >
                <Plus className="w-4 h-4" />
                Create your first product
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-1 ${
                            header.column.getCanSort()
                              ? "cursor-pointer select-none hover:text-slate-900"
                              : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <SortIcon sorted={header.column.getIsSorted()} />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (!sorted) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
  if (sorted === "asc") return <ChevronUp className="w-3 h-3" />;
  return <ChevronDown className="w-3 h-3" />;
}
