import { z } from "zod";
import { CATEGORIES, DELIVERY_METHODS, NOTIFICATION_EVENTS } from "./types";

const qty = z.number().int("Must be a whole number").min(0, "Must be 0 or more");
const optText = z.string().max(2000).nullish();

export const seedInputSchema = z.object({
  name: z.string().trim().min(1, "Seed name is required").max(200),
  variety: z.string().max(200).nullish(),
  category: z.enum(CATEGORIES),
  description: optText,
  physical_quantity: qty.nullish(),
  unit: z.string().max(40).optional(),
  storage_location: z.string().max(200).nullish(),
  low_stock_threshold: qty.nullish(),
});

export const seedUpdateSchema = seedInputSchema.omit({ physical_quantity: true }).partial();

export const stockCountSchema = z.object({
  physical_quantity: qty.nullable(),
  notes: z.string().max(500).nullish(),
});

export const orderItemInputSchema = z.object({
  requested_seed_name: z.string().trim().min(1).max(200),
  requested_quantity: qty.nullish(),
  seed_id: z.string().uuid().nullish(),
});

export const orderInputSchema = z.object({
  external_entry_id: z.string().max(200).nullish(),
  requester_name: z.string().trim().min(1, "Requester name is required").max(200),
  requester_email: z.union([z.string().email("Invalid email"), z.literal("")]).nullish(),
  organization_name: z.string().trim().min(1, "Organization or school is required").max(300),
  school_use: z.boolean().nullish(),
  mailing_address: z.string().max(1000).nullish(),
  student_count: qty.nullish(),
  requested_bundles: z.array(z.string().max(100)).max(50).optional(),
  special_requests: optText,
  garden_support: z.boolean().nullish(),
  seed_donation_interest: z.boolean().nullish(),
  submitted_at: z.string().datetime({ offset: true }).nullish(),
  source: z.string().max(50).optional(),
  items: z.array(orderItemInputSchema).max(200),
});

export const reviewItemSchema = z.object({
  item_id: z.string().uuid(),
  seed_id: z.string().uuid().nullable(),
  approved_quantity: qty.nullable(),
  unavailable: z.boolean(),
});

export const orderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_review") }),
  z.object({ action: z.literal("save_review"), review: z.array(reviewItemSchema) }),
  z.object({ action: z.literal("approve"), review: z.array(reviewItemSchema).nullable() }),
  z.object({ action: z.literal("add_item"), name: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("assign"), steward: z.string().max(100).nullable() }),
  z.object({ action: z.literal("start_preparing") }),
  z.object({
    action: z.literal("pack"),
    packs: z.array(z.object({ item_id: z.string().uuid(), packed_quantity: qty })),
  }),
  z.object({ action: z.literal("ready") }),
  z.object({ action: z.literal("deliver") }),
  z.object({ action: z.literal("deliver_partial"), follow_up: z.boolean() }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).nullish() }),
  z.object({
    action: z.literal("set_delivery"),
    delivery_method: z.enum(DELIVERY_METHODS).nullish(),
    delivery_lat: z.number().min(-90).max(90).nullish(),
    delivery_lng: z.number().min(-180).max(180).nullish(),
  }),
  z.object({ action: z.literal("add_bundle"), bundle_id: z.string().uuid() }),
]);

export const bundleSchema = z.object({
  name: z.string().trim().min(1, "Bundle name is required").max(100),
  description: z.string().max(500).nullish(),
  items: z.array(z.object({ seed_id: z.string().uuid(), quantity: qty.min(1, "At least 1") })).max(100),
});

const eventsShape = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, z.boolean().optional()])) as Record<
  (typeof NOTIFICATION_EVENTS)[number],
  z.ZodOptional<z.ZodBoolean>
>;
export const settingsPatchSchema = z.object({
  notifications: z
    .object({
      enabled: z.boolean().optional(),
      staff_email: z.union([z.string().email("Invalid email"), z.literal("")]).nullish(),
      events: z.object(eventsShape).partial().optional(),
    })
    .optional(),
  allocation: z
    .object({
      mode: z.enum(["none", "fixed", "per_students"]).optional(),
      fixed: qty.optional(),
      students_per_packet: qty.optional(),
      min: qty.optional(),
      max: qty.optional(),
    })
    .optional(),
  delivery: z
    .object({
      depot_name: z.string().max(100).optional(),
      depot_address: z.string().max(300).nullish(),
      depot_lat: z.number().min(-90).max(90).nullish(),
      depot_lng: z.number().min(-180).max(180).nullish(),
      max_stops_per_trip: qty.optional(),
      avg_speed_kmh: z.number().positive().max(130).optional(),
      minutes_per_stop: qty.optional(),
      return_to_depot: z.boolean().optional(),
    })
    .optional(),
});
export type OrderAction = z.infer<typeof orderActionSchema>;
