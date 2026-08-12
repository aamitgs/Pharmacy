"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ItemWithFlags } from "./types";

export function ItemsTable({ items }: { items: ItemWithFlags[] }) {
  const [search, setSearch] = useState("");

  const columns = useMemo<ColumnDef<ItemWithFlags>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <Link href={`/items/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
            {row.original.genericName && (
              <div className="text-xs text-muted-foreground">{row.original.genericName}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "manufacturer",
        header: "Manufacturer",
        cell: ({ row }) => row.original.manufacturer || "—",
      },
      {
        accessorKey: "scheduleClass",
        header: "Schedule",
        cell: ({ row }) =>
          row.original.scheduleClass === "none" ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Badge variant="outline">{row.original.scheduleClass}</Badge>
          ),
      },
      {
        accessorKey: "taxRate",
        header: "Tax %",
        cell: ({ row }) => `${row.original.taxRate}%`,
      },
      {
        id: "stock",
        header: "Stock",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "tabular-nums",
                row.original.outOfStock && "font-medium text-destructive"
              )}
            >
              {row.original.totalQty}
            </span>
            <span className="text-xs text-muted-foreground">/ {row.original.reorderLevel}</span>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const it = row.original;
          const badges: React.ReactNode[] = [];
          if (it.outOfStock) {
            badges.push(
              <Badge key="oos" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                Out of stock
              </Badge>
            );
          } else if (it.lowStock) {
            badges.push(
              <Badge key="low" className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                Low stock
              </Badge>
            );
          }
          if (it.hasExpired) {
            badges.push(
              <Badge key="exp" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                Expired batch
              </Badge>
            );
          } else if (it.hasNearExpiry) {
            badges.push(
              <Badge key="nexp" className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
                Near expiry
              </Badge>
            );
          }
          return badges.length ? (
            <div className="flex flex-wrap gap-1">{badges}</div>
          ) : (
            <Badge className="bg-success/15 text-success hover:bg-success/15">OK</Badge>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      const it = row.original;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.genericName?.toLowerCase().includes(q) ?? false) ||
        (it.manufacturer?.toLowerCase().includes(q) ?? false)
      );
    },
  });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search items by name, generic name, or manufacturer…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        autoFocus
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
