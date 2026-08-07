import { SlideCreateForm } from "@/components/slides/slide-create-form";

export default function NewSlidePage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest a slide</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Register the bundled sample slide or upload your own whole-slide image. It
          lands in B2 under its own slide prefix and a thumbnail is rendered on
          ingest. Run feature extraction afterwards from the slide page.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <SlideCreateForm />
      </div>
    </div>
  );
}
