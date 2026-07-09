"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";

import type { AccountRowFull } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

type SortKey = "rank" | "roomNights" | "revenue";
const TYPES = ["OTA", "TA", "CORPORATE", "WHOLESALER"] as const;

/** Sortable, type-filterable account production table (YTD). */
export function AccountProductionTable({ accounts }: { accounts: AccountRowFull[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");

  const rows = useMemo(() => {
    const filtered = filter ? accounts.filter((a) => a.accountType === filter) : accounts;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "rank") return a.rank - b.rank;
      if (sortKey === "roomNights") return b.roomNights - a.roomNights;
      return b.revenue - a.revenue;
    });
    return sorted;
  }, [accounts, filter, sortKey]);

  const sortableHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => setSortKey(key)}
      className={cn(
        "ml-auto inline-flex items-center gap-1 hover:text-foreground",
        sortKey === key && "text-foreground",
      )}
    >
      {label}
      <ArrowDownUp className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filter === null ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {ACCOUNT_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Account</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium"><div className="flex">{sortableHeader("Room Nights", "roomNights")}</div></th>
              <th className="py-2 pr-4 font-medium"><div className="flex">{sortableHeader("Revenue", "revenue")}</div></th>
              <th className="py-2 font-medium text-right">% of Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.accountName} className="border-b border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">{a.rank}</td>
                <td className="py-2 pr-4 text-foreground">{a.accountName}</td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[a.accountType] ?? a.accountType}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                  {formatNumber(a.roomNights)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                  {formatIDR(a.revenue)}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {formatPercent(a.pctOfRevenue)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No accounts for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
