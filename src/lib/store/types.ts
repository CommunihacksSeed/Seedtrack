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

export type StoreMode = "d1";

/** Data access layer. Business rules live in lib/domain.ts. */
export interface SeedFlowStore {
  mode: StoreMode;
  snapshot(): Promise<DataSnapshot>;

  /**
   * Run domain functions as one atomic write. `fn` must be synchronous and may
   * run more than once, so rebuild any results inside it. Use this for bulk
   * work: looping over the single-row methods spends D1 queries per row and
   * hits the per-invocation limit. The draft has no audit history loaded.
   */
  transact<T>(fn: (draft: DataSnapshot) => T): Promise<T>;

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
