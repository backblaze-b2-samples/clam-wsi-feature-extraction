"use client";

import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSlideAssetUrl } from "@/lib/queries";
import type { PreviewKind, Slide } from "@clam-wsi-feature-extraction/shared";

const VIEWS: { kind: PreviewKind; label: string; needsExtraction: boolean }[] = [
  { kind: "thumbnail", label: "Thumbnail", needsExtraction: false },
  { kind: "tissue_overlay", label: "Tissue mask", needsExtraction: true },
  { kind: "patch_grid", label: "Patch grid", needsExtraction: true },
];

export function PreviewViewer({ slide }: { slide: Slide }) {
  const extracted = slide.status === "extracted";
  const [kind, setKind] = useState<PreviewKind>("thumbnail");

  const available =
    kind === "thumbnail"
      ? !!slide.thumbnail_key
      : kind === "tissue_overlay"
        ? !!slide.tissue_overlay_key
        : !!slide.patch_grid_key;

  const { data, isFetching, error } = useSlideAssetUrl(slide.id, kind, {
    enabled: available,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3 px-5">
        <CardTitle className="card-title">Slide preview</CardTitle>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {VIEWS.map((view) => (
            <Button
              key={view.kind}
              type="button"
              variant={kind === view.kind ? "default" : "ghost"}
              size="sm"
              className="h-7 rounded-none"
              disabled={view.needsExtraction && !extracted}
              onClick={() => setKind(view.kind)}
              title={
                view.needsExtraction && !extracted
                  ? "Run feature extraction to see this view"
                  : undefined
              }
            >
              {view.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-border bg-black">
          {!available ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">
                {kind === "thumbnail"
                  ? "No thumbnail yet."
                  : "No overlay yet — run feature extraction."}
              </p>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Could not load this preview.</p>
          ) : data?.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned, expiring URL */}
              <img
                src={data.url}
                alt={`${kind} of ${slide.label}`}
                className="h-full w-full object-contain"
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-white/80" />
              )}
            </>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Previews are rendered server-side and streamed from B2 via short-lived
          presigned URLs — the browser never holds your credentials.
        </p>
      </CardContent>
    </Card>
  );
}
