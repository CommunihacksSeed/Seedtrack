"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useData } from "@/components/data-provider";
import { Button, Card, CardHeader, Field, Loading, PageHeader, inputCls, LinkButton } from "@/components/ui";
import { seedLabel } from "@/lib/domain";
import type { Order } from "@/lib/types";

const intString = z.string().trim().regex(/^\d*$/, "Whole number of 0 or more");
const schema = z.object({
  requester_name: z.string().trim().min(1, "Required"),
  requester_email: z.union([z.literal(""), z.string().trim().email("Invalid email")]),
  organization_name: z.string().trim().min(1, "Required"),
  school_use: z.enum(["", "yes", "no"]),
  mailing_address: z.string(),
  student_count: intString,
  bundles: z.string(),
  special_requests: z.string(),
  garden_support: z.enum(["", "yes", "no"]),
  external_entry_id: z.string(),
  items: z.array(z.object({ name: z.string(), quantity: intString })),
});
type FormValues = z.infer<typeof schema>;
const yn = (v: string) => (v === "yes" ? true : v === "no" ? false : null);

export default function NewRequestPage() {
  const { state, mutate, toast } = useData();
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      requester_name: "",
      requester_email: "",
      organization_name: "",
      school_use: "",
      mailing_address: "",
      student_count: "",
      bundles: "",
      special_requests: "",
      garden_support: "",
      external_entry_id: "",
      items: [{ name: "", quantity: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  if (!state) return <Loading />;

  async function onSubmit(v: FormValues) {
    const items = v.items
      .filter((i) => i.name.trim())
      .map((i) => ({ requested_seed_name: i.name.trim(), requested_quantity: i.quantity.trim() ? Number(i.quantity) : null }));
    const bundles = v.bundles.split(",").map((b) => b.trim()).filter(Boolean);
    if (!items.length && !bundles.length) {
      toast("Add at least one seed variety or bundle.", "error");
      return;
    }
    try {
      const res = await mutate<{ order: Order; duplicate: boolean }>("/api/orders", {
        requester_name: v.requester_name,
        requester_email: v.requester_email || null,
        organization_name: v.organization_name,
        school_use: yn(v.school_use),
        mailing_address: v.mailing_address || null,
        student_count: v.student_count ? Number(v.student_count) : null,
        requested_bundles: bundles,
        special_requests: v.special_requests || null,
        garden_support: yn(v.garden_support),
        external_entry_id: v.external_entry_id || null,
        source: "manual",
        items,
      });
      toast(res.duplicate ? `That Cognito entry was already imported as #${res.order.order_number}` : `Request #${res.order.order_number} created`, res.duplicate ? "error" : "success");
      router.push(`/requests/${res.order.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <>
      <Link href="/requests" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700">
        <ArrowLeft size={14} /> Seed Requests
      </Link>
      <PageHeader title="New seed request" subtitle="Enter a request by hand, e.g. from an email, phone call or a Cognito entry." />
      <datalist id="seed-names">
        {state.snapshot.seeds.map((s) => (
          <option key={s.id} value={seedLabel(s)} />
        ))}
      </datalist>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader title="Requester" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Requester name" error={errors.requester_name?.message}>
              <input className={inputCls} {...register("requester_name")} />
            </Field>
            <Field label="Email" error={errors.requester_email?.message}>
              <input className={inputCls} type="email" {...register("requester_email")} />
            </Field>
            <Field label="School or organization" error={errors.organization_name?.message} className="sm:col-span-2">
              <input className={inputCls} {...register("organization_name")} />
            </Field>
            <Field label="Mailing address" className="sm:col-span-2">
              <textarea className={inputCls} rows={2} {...register("mailing_address")} />
            </Field>
            <Field label="For school use?">
              <select className={inputCls} {...register("school_use")}>
                <option value="">Not specified</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Number of students / youth" error={errors.student_count?.message}>
              <input className={inputCls} inputMode="numeric" {...register("student_count")} />
            </Field>
            <Field label="Wants gardening support?">
              <select className={inputCls} {...register("garden_support")}>
                <option value="">Not specified</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Cognito entry ID" hint="Optional — prevents importing the same entry twice">
              <input className={inputCls} {...register("external_entry_id")} />
            </Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="What they asked for" subtitle="Quantities are optional. Leave blank if the requester didn't say — staff decide during review." />
          <div className="space-y-4 p-5">
            <Field label="Bundles" hint="Comma-separated, e.g. Spring, Fall Harvest, Herbs">
              <input className={inputCls} {...register("bundles")} />
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium text-forest-900">Seed varieties</p>
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div key={f.id} className="flex gap-2">
                    <input className={inputCls} list="seed-names" placeholder="Seed name, e.g. Kale" {...register(`items.${idx}.name`)} aria-label={`Seed ${idx + 1}`} />
                    <input className={`${inputCls} w-28`} inputMode="numeric" placeholder="Qty" {...register(`items.${idx}.quantity`)} aria-label={`Quantity ${idx + 1}`} />
                    <Button variant="ghost" onClick={() => remove(idx)} aria-label="Remove seed" disabled={fields.length === 1}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              {errors.items && <p className="mt-1 text-xs text-red-700">Quantities must be whole numbers.</p>}
              <Button size="sm" className="mt-2" onClick={() => append({ name: "", quantity: "" })}>
                <Plus size={14} /> Add variety
              </Button>
            </div>
            <Field label="Special requests">
              <textarea className={inputCls} rows={3} {...register("special_requests")} />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end gap-2 lg:col-span-2">
          <LinkButton href="/requests">Cancel</LinkButton>
          <Button type="submit" variant="primary" disabled={isSubmitting || !state.staff}>
            Create request
          </Button>
        </div>
      </form>
    </>
  );
}
