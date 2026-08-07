import { SlideEditView } from "@/components/slides/slide-edit-view";

export default async function EditSlidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Edit slide</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Update the label, MIL bag label, or notes. Bag labels and notes are written
          back into the slide&apos;s <code>manifest.json</code> on B2.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <SlideEditView id={id} />
      </div>
    </div>
  );
}
