// Core domain types for SeedFlow.

export const CATEGORIES = [
  "Greens",
  "Herbs",
  "Root Vegetables",
  "Flowers",
  "Fruits / Fruiting Vegetables",
  "Legumes",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ORDER_STATUSES = [
  "Received",
  "Under Review",
  "Approved",
  "Preparing",
  "Ready",
  "Delivered",
  "Cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses in which an order holds reserved stock. */
export const RESERVING_STATUSES: OrderStatus[] = ["Approved", "Preparing", "Ready"];
/** Statuses in which staff can still edit the review. */
export const REVIEWABLE_STATUSES: OrderStatus[] = ["Received", "Under Review"];
export const ACTIVE_STATUSES: OrderStatus[] = [
  "Received",
  "Under Review",
  "Approved",
  "Preparing",
  "Ready",
];

export type StockStatus = "Needs Stock Count" | "Available" | "Low Stock" | "Out of Stock";

export const MOVEMENT_TYPES = [
  "initial",
  "adjustment",
  "reservation",
  "release",
  "fulfillment",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  initial: "Initial stock entry",
  adjustment: "Stock adjustment",
  reservation: "Reservation",
  release: "Reservation release",
  fulfillment: "Fulfillment",
};

export interface Seed {
  id: string;
  name: string;
  variety: string | null;
  category: Category;
  description: string | null;
  /** null = Unknown / Not Counted. Never treat as zero. */
  physical_quantity: number | null;
  reserved_quantity: number;
  unit: string;
  storage_location: string | null;
  low_stock_threshold: number | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  external_entry_id: string | null;
  requester_name: string;
  requester_email: string | null;
  organization_name: string;
  school_use: boolean | null;
  mailing_address: string | null;
  student_count: number | null;
  requested_bundles: string[];
  special_requests: string | null;
  garden_support: boolean | null;
  seed_donation_interest: boolean | null;
  assigned_steward: string | null;
  status: OrderStatus;
  source: string;
  submitted_at: string;
  approved_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  seed_id: string | null;
  requested_seed_name: string;
  /** null = the requester did not specify a quantity. */
  requested_quantity: number | null;
  /** null = staff have not decided yet. */
  approved_quantity: number | null;
  packed_quantity: number;
  unavailable: boolean;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  seed_id: string;
  order_id: string | null;
  movement_type: MovementType;
  /** Signed change: + adds to the relevant bucket, - removes. */
  quantity: number;
  physical_after: number | null;
  reserved_after: number;
  notes: string | null;
  created_at: string;
}

export interface StatusHistoryEntry {
  id: string;
  order_id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  notes: string | null;
  changed_at: string;
}

export interface DataSnapshot {
  seeds: Seed[];
  orders: Order[];
  order_items: OrderItem[];
  inventory_movements: InventoryMovement[];
  order_status_history: StatusHistoryEntry[];
  /** Next human-readable order number. */
  next_order_number: number;
}

// ---------- Inputs ----------

export interface SeedInput {
  name: string;
  variety?: string | null;
  category: Category;
  description?: string | null;
  physical_quantity?: number | null;
  unit?: string;
  storage_location?: string | null;
  low_stock_threshold?: number | null;
}

export interface OrderItemInput {
  requested_seed_name: string;
  requested_quantity?: number | null;
  seed_id?: string | null;
}

export interface OrderInput {
  external_entry_id?: string | null;
  requester_name: string;
  requester_email?: string | null;
  organization_name: string;
  school_use?: boolean | null;
  mailing_address?: string | null;
  student_count?: number | null;
  requested_bundles?: string[];
  special_requests?: string | null;
  garden_support?: boolean | null;
  seed_donation_interest?: boolean | null;
  submitted_at?: string | null;
  source?: string;
  items: OrderItemInput[];
}

export interface ReviewItemInput {
  item_id: string;
  seed_id: string | null;
  approved_quantity: number | null;
  unavailable: boolean;
}

export interface PackItemInput {
  item_id: string;
  packed_quantity: number;
}
