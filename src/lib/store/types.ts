import type {
  AppSettings,
  Bundle,
  BundleInput,
  DeliveryInput,
  NotificationLogEntry,
  DataSnapshot,
  Order,
  OrderInput,
  OrderItem,
  PackItemInput,
  ReviewItemInput,
  Seed,
  SeedInput,
} from "../types";

export type SettingsPatch = {
  [K in keyof AppSettings]?: Partial<Omit<AppSettings[K], "events">> & (K extends "notifications" ? { events?: Partial<AppSettings["notifications"]["events"]> } : unknown);
};

export type StoreMode = "local-demo" | "supabase";

/**
 * Data access layer. Both implementations enforce the same business rules;
 * only the Supabase one is concurrency-safe across multiple server instances.
 */
export interface SeedFlowStore {
  mode: StoreMode;
  snapshot(): Promise<DataSnapshot>;

  createSeed(input: SeedInput): Promise<Seed>;
  updateSeed(id: string, input: Partial<Omit<SeedInput, "physical_quantity">>): Promise<Seed>;
  setStockCount(id: string, physical: number | null, notes: string | null): Promise<Seed>;
  deleteSeed(id: string): Promise<void>;

  createOrder(input: OrderInput): Promise<{ order: Order; duplicate: boolean }>;
  addOrderItem(orderId: string, name: string): Promise<OrderItem>;
  startReview(orderId: string): Promise<Order>;
  saveReview(orderId: string, review: ReviewItemInput[]): Promise<Order>;
  approveOrder(orderId: string, review: ReviewItemInput[] | null): Promise<Order>;
  assignSteward(orderId: string, steward: string | null): Promise<Order>;
  startPreparing(orderId: string): Promise<Order>;
  packItems(orderId: string, packs: PackItemInput[]): Promise<Order>;
  markReady(orderId: string): Promise<Order>;
  deliverOrder(orderId: string): Promise<Order>;
  cancelOrder(orderId: string, reason: string | null): Promise<Order>;

  setDelivery(orderId: string, input: DeliveryInput): Promise<Order>;
  addBundleItems(orderId: string, bundleId: string): Promise<number>;

  updateSettings(patch: SettingsPatch): Promise<AppSettings>;
  saveBundle(id: string | null, input: BundleInput): Promise<Bundle>;
  deleteBundle(id: string): Promise<void>;
  logNotification(entry: Omit<NotificationLogEntry, "id" | "created_at">): Promise<void>;

  resetDemo(): Promise<void>;
}
