import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  UploadCloud,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SlideStatus } from "@clam-wsi-feature-extraction/shared";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_META: Record<
  SlideStatus,
  { label: string; variant: BadgeVariant; icon: typeof CircleDashed; spin?: boolean }
> = {
  pending_upload: { label: "Awaiting upload", variant: "outline", icon: UploadCloud },
  registered: { label: "Registered", variant: "secondary", icon: CircleDashed },
  extracting: { label: "Extracting", variant: "outline", icon: Loader2, spin: true },
  extracted: { label: "Extracted", variant: "default", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: AlertTriangle },
};

export function SlideStatusBadge({ status }: { status: SlideStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon className={meta.spin ? "animate-spin" : ""} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
