"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SlideEditForm } from "./slide-edit-form";
import { useSlide } from "@/lib/queries";

export function SlideEditView({ id }: { id: string }) {
  const { data: slide, isLoading, error, refetch } = useSlide(id);

  if (isLoading) {
    return <Skeleton className="h-80 w-full rounded-lg" />;
  }
  if (error || !slide) {
    return (
      <ErrorState
        error={error ?? new Error("Slide not found")}
        onRetry={() => refetch()}
      />
    );
  }
  return <SlideEditForm slide={slide} />;
}
