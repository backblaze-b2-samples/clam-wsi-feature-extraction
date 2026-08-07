import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SlideLibrary } from "@/components/slides/slide-library";

export default function SlidesPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Slides</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Your whole-slide images. Each one is a source WSI plus its CLAM-style
            derived artifacts — extracted patches, a per-slide embedding bag, and
            previews — under a single B2 prefix.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href="/slides/new">
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Ingest slide
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <SlideLibrary />
      </div>
    </div>
  );
}
