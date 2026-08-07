"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ExtractionResult } from "@clam-wsi-feature-extraction/shared";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function ExtractionStats({ result }: { result: ExtractionResult }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3 px-5">
        <CardTitle className="card-title">Feature extraction</CardTitle>
        <Badge variant="secondary" title="Inference device (auto-detected)">
          {result.device.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="p-5">
        <dl className="divide-y divide-border">
          <StatRow label="Encoder" value={result.encoder} />
          <StatRow label="Patches embedded" value={result.num_patches.toLocaleString()} />
          <StatRow
            label="Embedding bag shape"
            value={`[${result.num_patches}, ${result.feature_dim}]`}
          />
          <StatRow label="Patch level" value={result.patch_level} />
          <StatRow label="Patch size" value={`${result.patch_size} px`} />
          <StatRow
            label="Tissue fraction"
            value={`${(result.tissue_fraction * 100).toFixed(1)}%`}
          />
        </dl>
      </CardContent>
    </Card>
  );
}
