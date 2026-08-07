import { SlideDetail } from "@/components/slides/slide-detail";

export default async function SlideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SlideDetail id={id} />;
}
