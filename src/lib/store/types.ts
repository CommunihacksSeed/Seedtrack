import type {
  DataSnapshot,
  Order,
  OrderInput,
  OrderItem,
  PackItemInput,
  ReviewItemInput,
  Seed,
  SeedInput,
} from "../types";

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

  resetDemo(): Promise<void>;
}
