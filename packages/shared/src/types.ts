export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  /** Set when a format-specific extractor was skipped or failed (e.g. an image
   *  above the decompression-bomb decode limit). Core fields stay exact. */
  metadata_warning: string | null;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

/** A short-lived presigned PUT the browser uploads a file directly to B2 with.
 *  `headers` are signed into the URL, so the browser must send them verbatim. */
export interface PresignUploadResponse {
  key: string;
  url: string;
  method: string;
  content_type: string;
  headers: Record<string, string>;
  expires_in: number;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Slides (WSI feature-extraction domain) -------------------------------

export type SlideStatus =
  | "pending_upload"
  | "registered"
  | "extracting"
  | "extracted"
  | "failed";
export type SlideSource = "sample" | "upload";
// Coarse in-flight extraction stage, persisted to the manifest so the slide
// detail view advances through real steps during a run. Null on terminal status.
export type SlideStage = "tiling" | "embedding" | "finalizing";
export type PreviewKind = "thumbnail" | "tissue_overlay" | "patch_grid";
export type AssetName =
  | "thumbnail"
  | "tissue_overlay"
  | "patch_grid"
  | "embeddings"
  | "manifest";

export interface ExtractionResult {
  encoder: string;
  device: string;
  num_patches: number;
  feature_dim: number;
  patch_level: number;
  patch_size: number;
  tissue_fraction: number;
  embeddings_key: string;
}

export interface SlideSummary {
  id: string;
  label: string;
  source: SlideSource;
  status: SlideStatus;
  bag_label: string;
  encoder: string;
  patch_level: number;
  patch_size: number;
  created_at: string;
  updated_at: string;
  source_filename: string;
  size_bytes: number;
  size_human: string;
  num_patches: number;
  feature_dim: number;
  thumbnail_key: string | null;
  error: string | null;
}

export interface Slide extends SlideSummary {
  notes: string;
  source_key: string | null;
  manifest_key: string;
  embeddings_key: string | null;
  tissue_overlay_key: string | null;
  patch_grid_key: string | null;
  width: number | null;
  height: number | null;
  level_count: number | null;
  mpp: number | null;
  extraction: ExtractionResult | null;
  stage: SlideStage | null;
}

export interface PresignedUpload {
  key: string;
  url: string;
  method: string;
  content_type: string;
  headers: Record<string, string>;
  expires_in: number;
}

export interface SlideCreated {
  slide: Slide;
  upload: PresignedUpload | null;
}

export interface SlideStats {
  total_slides: number;
  extracted_slides: number;
  source_bytes: number;
  source_bytes_human: string;
  total_patches: number;
  patch_bytes: number;
  patch_bytes_human: string;
  embedding_bytes: number;
  embedding_bytes_human: string;
  total_objects: number;
  total_size_bytes: number;
  total_size_human: string;
}

export interface EncoderOption {
  key: string;
  name: string;
  feature_dim: number;
  description: string;
}

// Mirror of services/api/app/types/slides.py FEATURE_ENCODERS. Finite,
// selectable set for the create/edit forms (never free text).
export const FEATURE_ENCODERS: EncoderOption[] = [
  {
    key: "resnet50-truncated",
    name: "ResNet50 (truncated, ImageNet)",
    feature_dim: 1024,
    description:
      "CLAM's default encoder — a torchvision ResNet50 truncated after layer3 with adaptive average pooling, giving a 1024-d patch embedding.",
  },
];

export const PATCH_LEVEL_OPTIONS = [0, 1, 2] as const;
export const PATCH_SIZE_OPTIONS = [256, 512] as const;
// Mirror of the default MIL_BAG_LABELS; a clone can extend via the env var.
export const DEFAULT_BAG_LABELS = ["tumor", "normal", "unknown"] as const;
export const DEFAULT_ENCODER = "resnet50-truncated";
export const DEFAULT_PATCH_LEVEL = 0;
export const DEFAULT_PATCH_SIZE = 256;
export const DEFAULT_BAG_LABEL = "unknown";
