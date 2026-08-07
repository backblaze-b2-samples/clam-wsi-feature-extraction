"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useUpdateSlide } from "@/lib/queries";
import type { Slide } from "@clam-wsi-feature-extraction/shared";
import { DEFAULT_BAG_LABELS } from "@clam-wsi-feature-extraction/shared";

// The slide's current bag label may have come from a custom MIL_BAG_LABELS env,
// so include it in the options even if it's outside the default triplet.
function bagOptions(current: string): string[] {
  const options = [...DEFAULT_BAG_LABELS] as string[];
  return options.includes(current) ? options : [current, ...options];
}

const schema = z.object({
  label: z.string().min(1, "Give the slide a label").max(120),
  bag_label: z.string().min(1).max(60),
  notes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function SlideEditForm({ slide }: { slide: Slide }) {
  const router = useRouter();
  const updateSlide = useUpdateSlide();
  const options = bagOptions(slide.bag_label);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Pre-filled from the manifest — edit forms surface no default hints.
    defaultValues: {
      label: slide.label,
      bag_label: slide.bag_label,
      notes: slide.notes ?? "",
    },
  });

  const onSubmit = (values: FormValues) => {
    updateSlide.mutate(
      { id: slide.id, label: values.label, bag_label: values.bag_label, notes: values.notes },
      {
        onSuccess: () => {
          toast.success("Slide updated");
          router.push(`/slides/${slide.id}`);
        },
        onError: (e) => toast.error(`Update failed: ${e.message}`),
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Edit slide</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
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
                      {options.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Textarea className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/slides/${slide.id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateSlide.isPending}>
            {updateSlide.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {updateSlide.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
