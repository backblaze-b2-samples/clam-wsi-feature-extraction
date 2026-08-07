"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Microscope, MoreVertical, Pencil, Play, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useDeleteSlide, useExtractSlide, useSlideAssetUrl } from "@/lib/queries";
import type { SlideSummary } from "@clam-wsi-feature-extraction/shared";

function Thumbnail({ slide }: { slide: SlideSummary }) {
  const { data } = useSlideAssetUrl(slide.id, "thumbnail", {
    enabled: !!slide.thumbnail_key,
  });
  if (data?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- presigned, expiring URL
      <img
        src={data.url}
        alt={`Thumbnail of ${slide.label}`}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <Microscope className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function SlideCard({ slide }: { slide: SlideSummary }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const extractSlide = useExtractSlide();
  const deleteSlide = useDeleteSlide();
  const busy = slide.status === "extracting" || extractSlide.isPending;
  const canExtract = slide.status !== "pending_upload";

  const onRun = () => {
    extractSlide.mutate(slide.id, {
      onSuccess: () => toast.success(`Feature extraction complete for ${slide.label}`),
      onError: (e) => toast.error(`Extraction failed: ${e.message}`),
    });
  };

  const onDelete = () => {
    deleteSlide.mutate(slide.id, {
      onSuccess: () => toast.success(`Deleted ${slide.label}`),
      onError: (e) => toast.error(`Delete failed: ${e.message}`),
    });
    setConfirmOpen(false);
  };

  return (
    <Card className="card-hover overflow-hidden p-0">
      <Link href={`/slides/${slide.id}`} className="block">
        <div className="aspect-square w-full border-b border-border">
          <Thumbnail slide={slide} />
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <Link
            href={`/slides/${slide.id}`}
            className="block truncate text-sm font-semibold hover:underline"
            title={slide.label}
          >
            {slide.label}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            bag: {slide.bag_label} · {slide.num_patches} patches
          </p>
          <div className="mt-2">
            <SlideStatusBadge status={slide.status} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Slide actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRun} disabled={busy || !canExtract}>
              <Play className="h-4 w-4" />
              {slide.status === "extracted" ? "Re-run extraction" : "Run extraction"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push(`/slides/${slide.id}/edit`)}>
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{slide.label}</strong> and every
              artifact under its <code>slides/{slide.id}/</code> prefix — source
              WSI, patches, embedding bag, and previews. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
