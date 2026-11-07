"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useData } from "@/components/data-provider";
import { LinkButton, Loading, PageHeader } from "@/components/ui";
import { SeedRequestForm } from "@/components/seed-request-form";
import type { Order } from "@/lib/types";

/** Staff enter a request by hand (phone, email, paper) with the same questions as the public form. */
export default function NewRequestPage() {
  const { state, mutate, toast } = useData();
  const router = useRouter();
  if (!state) return <Loading label="Loading form" />;
  return (
    <SeedRequestForm
      seeds={state.snapshot.seeds}
      bundleOptions={state.snapshot.bundles}
      header={
        <>
          <LinkButton href="/requests" variant="ghost" size="sm">
            <ArrowLeft /> Seed Requests
          </LinkButton>
          <PageHeader
            title="New seed request"
            subtitle="Enter a request on someone’s behalf. Schools can also fill in the public form themselves."
            actions={
              <LinkButton href="/request" size="sm">
                <ExternalLink /> Open public form
              </LinkButton>
            }
          />
        </>
      }
      onSubmit={async (payload) => {
        const res = await mutate<{ order: Order }>("/api/orders", { ...payload, source: "manual" });
        toast(`Request #${res.order.order_number} added.`);
        router.push(`/requests/${res.order.id}`);
      }}
    />
  );
}
