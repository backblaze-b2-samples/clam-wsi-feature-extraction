"use client";

import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SlideStatusBadge } from "@/components/slides/status-badge";
import { useSlides } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function RecentSlides() {
  const { data: slides = [], isLoading, error, refetch } = useSlides();
  const recent = slides.slice(0, 8);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent Slides</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/slides"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No slides yet"
            description="Ingest a slide to get started."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[42%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Slide
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Patches
                </TableHead>
                <TableHead className="w-[22%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((slide) => (
                <TableRow key={slide.id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/slides/${slide.id}`}
                      className="block truncate rounded-sm underline-offset-4 hover:underline"
                      title={slide.label}
                    >
                      {slide.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {slide.num_patches.toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <SlideStatusBadge status={slide.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(slide.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
