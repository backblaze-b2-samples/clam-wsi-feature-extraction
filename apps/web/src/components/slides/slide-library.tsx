"use client";

import Link from "next/link";
import { Layers, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SlideCard } from "./slide-card";
import { useSlides } from "@/lib/queries";

/**
 * The Slide "Library" — a sample-scoped asset explorer over the `slides/`
 * prefix (distinct from the full-bucket /files explorer). Lists slides by
 * scanning each `slides/<id>/manifest.json` on the API side.
 */
export function SlideLibrary() {
  const { data: slides = [], isLoading, error, refetch } = useSlides();

  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No slides yet"
        description="Ingest a whole-slide image to create your first slide. Its source WSI, extracted patches, embedding bag, and previews all land under one B2 prefix."
        action={
          <Button asChild size="sm">
            <Link href="/slides/new">
              <Plus className="h-4 w-4" />
              Ingest a slide
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {slides.map((slide) => (
        <SlideCard key={slide.id} slide={slide} />
      ))}
    </div>
  );
}
