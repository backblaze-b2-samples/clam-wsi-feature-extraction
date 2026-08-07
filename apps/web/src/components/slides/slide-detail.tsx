"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Pencil, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SlideStatusBadge } from "./status-badge";
import { PreviewViewer } from "./preview-viewer";
import { ExtractionStats } from "./extraction-stats";
import { getSlideAssetUrl } from "@/lib/api-client";
import { startBrowserDownload } from "@/lib/browser-download";
import { formatDate } from "@/lib/utils";
import { useDeleteSlide, useExtractSlide, useSlide } from "@/lib/queries";
import type { AssetName, Slide } from "@clam-wsi-feature-extraction/shared";

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function Artifacts({ slide }: { slide: Slide }) {
  const download = async (name: AssetName, filename: string, available: boolean) => {
    if (!available) return;
    try {
      const { url } = await getSlideAssetUrl(slide.id, name);
      startBrowserDownload(url, filename);
    } catch {
      toast.error("Could not fetch a download link");
    }
  };

  const items: { name: AssetName; label: string; filename: string; available: boolean }[] = [
    {
      name: "embeddings",
      label: "Embedding bag (.pt)",
      filename: "embeddings.pt",
      available: !!slide.embeddings_key,
    },
    { name: "manifest", label: "Manifest (.json)", filename: "manifest.json", available: true },
  ];

  return (
    <Card>
      <CardHeader className="border-b border-border py-3 px-5">
        <CardTitle className="card-title">Artifacts on B2</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            <span className="text-sm">{item.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={!item.available}
              onClick={() => download(item.name, item.filename, item.available)}
            >
              <Download className="h-3.5 w-3.5" />
              {item.available ? "Download" : "Not yet"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SlideDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: slide, isLoading, error, refetch } = useSlide(id);
  const extractSlide = useExtractSlide();
  const deleteSlide = useDeleteSlide();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }
  if (error || !slide) {
    return (
      <ErrorState error={error ?? new Error("Slide not found")} onRetry={() => refetch()} />
    );
  }

  const processing = slide.status === "extracting" || extractSlide.isPending;
  const canExtract = slide.status !== "pending_upload";

  const onRun = () =>
    extractSlide.mutate(slide.id, {
      onSuccess: () => toast.success("Feature extraction complete"),
      onError: (e) => toast.error(`Extraction failed: ${e.message}`),
    });

  const onDelete = () => {
    deleteSlide.mutate(slide.id, {
      onSuccess: () => {
        toast.success(`Deleted ${slide.label}`);
        router.push("/slides");
      },
      onError: (e) => toast.error(`Delete failed: ${e.message}`),
    });
    setConfirmOpen(false);
  };

  const dims = slide.width && slide.height ? `${slide.width} × ${slide.height}` : "—";

  return (
    <div className="space-y-6">
      <div className="animate-fade-in border-b border-border pb-5">
        <Link
          href="/slides"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Library
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="page-title truncate">{slide.label}</h1>
              <SlideStatusBadge status={slide.status} />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              bag: {slide.bag_label} · {slide.encoder} · level {slide.patch_level} ·{" "}
              {slide.patch_size}px patches
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onRun} disabled={processing || !canExtract} size="sm">
              {processing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {slide.status === "extracted" ? "Re-run" : "Run extraction"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/slides/${slide.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {slide.status === "failed" && slide.error && (
        <Alert variant="destructive">
          <AlertTitle>Feature extraction failed</AlertTitle>
          <AlertDescription>{slide.error}</AlertDescription>
        </Alert>
      )}
      {slide.status === "pending_upload" && (
        <Alert>
          <AlertTitle>Waiting for the slide upload</AlertTitle>
          <AlertDescription>
            This slide was created for an own-WSI upload but the bytes have not been
            confirmed yet. Re-ingest from the Ingest page if the upload was interrupted.
          </AlertDescription>
        </Alert>
      )}
      {processing && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Feature extraction running</AlertTitle>
          <AlertDescription>
            OpenSlide is tiling the slide over tissue regions and the CNN is embedding
            each patch (weights download on the first run). This can take a bit on CPU —
            this view updates automatically.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-2">
          <PreviewViewer slide={slide} />
        </div>
        <div className="animate-fade-in-up stagger-3 space-y-6">
          <Card>
            <CardHeader className="border-b border-border py-3 px-5">
              <CardTitle className="card-title">Details</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <dl className="divide-y divide-border">
                <MetaRow label="Source file" value={slide.source_filename} />
                <MetaRow label="Source" value={slide.source} />
                <MetaRow label="Size" value={slide.size_human} />
                <MetaRow label="Dimensions (level 0)" value={dims} />
                <MetaRow label="Pyramid levels" value={slide.level_count ?? "—"} />
                <MetaRow
                  label="Microns / pixel"
                  value={slide.mpp ? slide.mpp.toFixed(4) : "—"}
                />
                <MetaRow label="Patches" value={slide.num_patches.toLocaleString()} />
                <MetaRow label="Feature dim" value={slide.feature_dim} />
                {slide.notes && <MetaRow label="Notes" value={slide.notes} />}
                <MetaRow label="Created" value={formatDate(slide.created_at)} />
                <MetaRow label="Updated" value={formatDate(slide.updated_at)} />
              </dl>
            </CardContent>
          </Card>
          {slide.extraction && <ExtractionStats result={slide.extraction} />}
          <Artifacts slide={slide} />
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{slide.label}</strong> and every
              artifact under <code>slides/{slide.id}/</code>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
