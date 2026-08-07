"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { FileUp, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { registerSlide, putSlideToStorage } from "@/lib/api-client";
import { useCreateSlide } from "@/lib/queries";
import {
  DEFAULT_BAG_LABEL,
  DEFAULT_BAG_LABELS,
  DEFAULT_ENCODER,
  DEFAULT_PATCH_LEVEL,
  DEFAULT_PATCH_SIZE,
  FEATURE_ENCODERS,
  PATCH_LEVEL_OPTIONS,
  PATCH_SIZE_OPTIONS,
} from "@clam-wsi-feature-extraction/shared";

const ENCODER_KEYS = FEATURE_ENCODERS.map((e) => e.key) as [string, ...string[]];
const BAG_LABELS = DEFAULT_BAG_LABELS as unknown as [string, ...string[]];

const schema = z.object({
  source: z.enum(["sample", "upload"]),
  label: z.string().min(1, "Give the slide a label").max(120),
  bag_label: z.enum(BAG_LABELS),
  patch_level: z.enum(["0", "1", "2"]),
  patch_size: z.enum(["256", "512"]),
  encoder: z.enum(ENCODER_KEYS),
  notes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

const ACCEPT = {
  "application/octet-stream": [".svs", ".tif", ".tiff", ".ndpi", ".scn"],
  "image/tiff": [".tif", ".tiff"],
};

// The canonical bundled sample name — used as the pre-filled Label on the
// golden path so a first-time user can ingest the recommended sample without
// inventing a name. Matches the "Sample slide (CMU-1-Small-Region)" option.
const SAMPLE_LABEL = "CMU-1-Small-Region";

// Filename without its extension, e.g. "TCGA-A1.svs" -> "TCGA-A1".
function labelFromFilename(name: string): string {
  return name.replace(/\.[^./\\]+$/, "") || name;
}

export function SlideCreateForm() {
  const router = useRouter();
  const createSlide = useCreateSlide();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Once the user types in Label, stop auto-deriving it from the source so we
  // never clobber their name when they switch source or pick a file.
  const labelEditedRef = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Pre-fill the Label from the default source (the bundled sample) so the
    // golden path needs no typing; every other default is guidance, not magic.
    defaultValues: {
      source: "sample",
      label: SAMPLE_LABEL,
      bag_label: DEFAULT_BAG_LABEL,
      patch_level: String(DEFAULT_PATCH_LEVEL) as "0",
      patch_size: String(DEFAULT_PATCH_SIZE) as "256",
      encoder: DEFAULT_ENCODER,
      notes: "",
    },
  });

  const source = form.watch("source");

  const onDrop = useCallback(
    (accepted: File[]) => {
      const picked = accepted[0];
      if (!picked) return;
      setFile(picked);
      setFileError(null);
      // Derive the label from the uploaded filename unless the user set one.
      if (!labelEditedRef.current) {
        form.setValue("label", labelFromFilename(picked.name), {
          shouldValidate: true,
        });
      }
    },
    [form]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
  });

  const busy = createSlide.isPending || uploading;

  const onSubmit = async (values: FormValues) => {
    const common = {
      label: values.label,
      bag_label: values.bag_label,
      patch_level: Number(values.patch_level),
      patch_size: Number(values.patch_size),
      encoder: values.encoder,
      notes: values.notes ?? "",
    };

    if (values.source === "sample") {
      createSlide.mutate(
        { source: "sample", ...common },
        {
          onSuccess: ({ slide }) => {
            toast.success(`Slide "${slide.label}" registered`);
            router.push(`/slides/${slide.id}`);
          },
          onError: (e) => toast.error(`Ingest failed: ${e.message}`),
        }
      );
      return;
    }

    // Own-WSI upload: presign -> browser PUT direct to B2 -> register.
    if (!file) {
      setFileError("Choose a .svs / .tiff whole-slide image to upload");
      return;
    }
    const contentType = file.type || "application/octet-stream";
    try {
      const { slide, upload } = await createSlide.mutateAsync({
        source: "upload",
        ...common,
        filename: file.name,
        content_type: contentType,
        size_bytes: file.size,
      });
      if (!upload) throw new Error("No upload URL returned");
      setUploading(true);
      await putSlideToStorage(upload, file);
      await registerSlide(slide.id);
      toast.success(`Slide "${slide.label}" uploaded`);
      router.push(`/slides/${slide.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      toast.error(`Ingest failed: ${message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Ingest a slide</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slide source</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Keep the pre-filled label in sync with the chosen
                        // source until the user overrides it.
                        if (!labelEditedRef.current) {
                          form.setValue(
                            "label",
                            value === "sample"
                              ? SAMPLE_LABEL
                              : file
                                ? labelFromFilename(file.name)
                                : "",
                            { shouldValidate: true }
                          );
                        }
                      }}
                      value={field.value}
                      className="flex flex-col gap-2"
                    >
                      <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm cursor-pointer">
                        <RadioGroupItem value="sample" className="mt-0.5" />
                        <span>
                          <span className="font-medium">Sample slide (CMU-1-Small-Region)</span>
                          <span className="block text-xs text-muted-foreground">
                            ~1.9 MB Aperio SVS fetched from the OpenSlide test set —
                            tiles + extracts in seconds on CPU.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm cursor-pointer">
                        <RadioGroupItem value="upload" className="mt-0.5" />
                        <span>
                          <span className="font-medium">Upload my own WSI</span>
                          <span className="block text-xs text-muted-foreground">
                            Streams straight to B2 with a presigned PUT — a multi-GB
                            slide never passes through the API.
                          </span>
                        </span>
                      </label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {source === "upload" && (
              <div className="space-y-1.5">
                <FormLabel>Whole-slide image</FormLabel>
                <div
                  {...getRootProps()}
                  className={[
                    "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-md",
                    "border-2 border-dashed px-4 py-8 text-center transition-colors",
                    isDragActive
                      ? "border-primary bg-[var(--accent-subtle)]"
                      : "border-border hover:border-primary/60 hover:bg-muted/60",
                  ].join(" ")}
                >
                  <input {...getInputProps()} aria-label="Choose a whole-slide image" />
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted border border-border">
                    <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm font-semibold [overflow-wrap:anywhere]">
                    {file ? file.name : "Drag & drop, or click to choose a slide"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aperio .svs or pyramidal .tiff — up to 5 GB
                  </p>
                </div>
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
              </div>
            )}

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Breast biopsy — case 001"
                      {...field}
                      onChange={(e) => {
                        labelEditedRef.current = true;
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    A human-readable name for this slide, pre-filled from the source.
                    Edit it freely — e.g. include the tissue and case id so it is easy
                    to find later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bag_label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MIL bag label</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-60">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEFAULT_BAG_LABELS.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Slide-level label for weakly-supervised MIL, stored alongside the
                    embeddings. Defaults to <code>unknown</code> — set it once you know.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="patch_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patch level (magnification)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PATCH_LEVEL_OPTIONS.map((level) => (
                          <SelectItem key={level} value={String(level)}>
                            Level {level}
                            {level === 0 ? " (highest res)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Pyramid level to read patches from. Default is 0 (highest
                      resolution); coarser levels are used if a slide lacks level 0.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="patch_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patch size (px)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PATCH_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size} × {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Square tile size fed to the encoder. Default 256 — the CLAM
                      standard.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="encoder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feature encoder</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FEATURE_ENCODERS.map((e) => (
                        <SelectItem key={e.key} value={e.key}>
                          {e.name} · {e.feature_dim}-d
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    CNN that turns each patch into an embedding. Default is CLAM&apos;s
                    truncated ResNet50 (1024-d); weights download once and cache.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional free-text annotations for this slide"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {busy && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>{uploading ? "Uploading slide" : "Registering slide"}</AlertTitle>
            <AlertDescription>
              <p>
                {uploading
                  ? "Streaming your slide straight to B2, then registering it. Keep this tab open."
                  : "Landing the slide in B2 and rendering its thumbnail. You'll be taken to the slide automatically."}
              </p>
              <div
                role="progressbar"
                aria-label="Working"
                className="progress-indeterminate mt-2 h-1 w-full rounded-full"
              />
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/slides")}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Working..." : "Ingest slide"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
