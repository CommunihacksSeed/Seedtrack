"use client";

import { useParams } from "next/navigation";
import { useData } from "@/components/data-provider";
import { ErrorState, Loading } from "@/components/ui";
import { RequestReview } from "@/components/request-review";

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, error, refresh } = useData();
  if (error && !state) return <ErrorState message={error} onRetry={refresh} />;
  if (!state) return <Loading label="Loading request" />;
  return <RequestReview orderId={id} variant="page" />;
}
