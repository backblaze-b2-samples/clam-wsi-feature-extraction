"use client";

import { HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSlideStats } from "@/lib/queries";

function Bar({
  label,
  value,
  human,
  total,
  color,
}: {
  label: string;
  value: number;
  human: string;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.max(2, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{human}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The storage fan-out story: one gigapixel slide explodes into thousands of
 * patch PNGs plus one embedding bag, so derived data dwarfs the raw WSIs. This
 * panel shows raw vs. derived bytes on the `slides/` prefix.
 */
export function CohortFanout() {
  const { data: stats, isLoading, error, refetch } = useSlideStats();

  const raw = stats?.source_bytes ?? 0;
  const derived = (stats?.total_size_bytes ?? 0) - raw;
  const total = Math.max(raw + derived, 1);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Storage fan-out</CardTitle>
        <CardDescription className="text-xs">
          Raw WSIs vs. derived patches + embeddings on B2
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (stats?.total_objects ?? 0) === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="No slides yet"
            description="Ingest a slide and run feature extraction to see the fan-out."
          />
        ) : (
          <div className="space-y-5">
            <Bar
              label="Raw WSIs (source)"
              value={raw}
              human={stats?.source_bytes_human ?? "0 B"}
              total={total}
              color="bg-[var(--chart-2)]"
            />
            <Bar
              label={`Derived (${(stats?.total_patches ?? 0).toLocaleString()} patches + embeddings)`}
              value={derived}
              human={`${stats?.patch_bytes_human ?? "0 B"} patches · ${stats?.embedding_bytes_human ?? "0 B"} embeddings`}
              total={total}
              color="bg-[var(--chart-1)]"
            />
            <p className="text-xs text-muted-foreground">
              Every tier — raw, patches, and feature tensors — lands on Backblaze B2
              through the S3-compatible API.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
