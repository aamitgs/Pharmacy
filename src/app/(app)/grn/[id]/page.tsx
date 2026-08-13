import { notFound } from "next/navigation";
import { getGrn } from "@/lib/actions/grn";
import { GrnDetailClient } from "@/components/purchasing/grn-detail-client";

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const grn = await getGrn(id);
  if (!grn) notFound();

  return <GrnDetailClient grn={grn} />;
}
