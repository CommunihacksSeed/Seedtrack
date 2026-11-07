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

export const DELIVERY_METHODS = ["drop-off", "mail", "pickup"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  "drop-off": "Drop-off",
  mail: "Mail",
  pickup: "Pickup",
};

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
  /** How the order reaches the requester; null = not decided yet. */
  delivery_method: DeliveryMethod | null;
  /** Coordinates of the mailing address, for route planning. */
  delivery_lat: number | null;
  delivery_lng: number | null;
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

// ---------- Settings, bundles, notifications ----------

export const NOTIFICATION_EVENTS = [
  "request_received",
  "order_approved",
  "order_ready",
  "order_delivered",
  "low_stock",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_EVENT_INFO: Record<NotificationEvent, { label: string; to: "staff" | "requester" }> = {
  request_received: { label: "New seed request received", to: "staff" },
  order_approved: { label: "Request approved", to: "requester" },
  order_ready: { label: "Order packed and ready", to: "requester" },
  order_delivered: { label: "Order delivered", to: "requester" },
  low_stock: { label: "Seed running low or out of stock", to: "staff" },
};

export interface AppSettings {
  notifications: {
    enabled: boolean;
    events: Record<NotificationEvent, boolean>;
    /** Where staff notifications go. */
    staff_email: string | null;
  };
  allocation: {
    /** How to suggest packets when the requester gave no quantity. Staff always confirm. */
    mode: "none" | "fixed" | "per_students";
    fixed: number;
    students_per_packet: number;
    min: number;
    max: number;
  };
  delivery: {
    depot_name: string;
    depot_address: string | null;
    depot_lat: number | null;
    depot_lng: number | null;
    max_stops_per_trip: number;
    avg_speed_kmh: number;
    minutes_per_stop: number;
    return_to_depot: boolean;
  };
}

export interface BundleItem {
  seed_id: string;
  quantity: number;
}
export interface Bundle {
  id: string;
  name: string;
  description: string | null;
  items: BundleItem[];
  created_at: string;
  updated_at: string;
}

export interface NotificationLogEntry {
  id: string;
  event: NotificationEvent;
  order_id: string | null;
  seed_id: string | null;
  recipient: string | null;
  subject: string;
  body: string;
  /** sent = emailed; logged = recorded only (no email service configured); skipped = no recipient; failed = email error */
  status: "sent" | "logged" | "skipped" | "failed";
  error: string | null;
  created_at: string;
}

export interface DataSnapshot {
  seeds: Seed[];
  orders: Order[];
  order_items: OrderItem[];
  inventory_movements: InventoryMovement[];
  order_status_history: StatusHistoryEntry[];
  settings: AppSettings;
  bundles: Bundle[];
  notifications: NotificationLogEntry[];
  /** Next human-readable order number. */
  next_order_number: number;
}

export interface DeliveryInput {
  delivery_method?: DeliveryMethod | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
}

export interface BundleInput {
  name: string;
  description?: string | null;
  items: BundleItem[];
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
