import { getStore } from "@/lib/store";
import { DomainError } from "@/lib/domain";
import { staffWrite } from "@/lib/server/http";
import { deliverNotification } from "@/lib/server/notify";

/** Send a sample "new request" notification to the staff email, even if notifications are off. */
export async function POST(req: Request) {
  return staffWrite(req, async () => {
    const store = getStore();
    const db = await store.snapshot();
    const latest = [...db.orders].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latest) throw new DomainError("Create at least one request first.");
    if (!db.settings.notifications.staff_email) throw new DomainError("Set a staff email first.");
    return deliverNotification(store, "request_received", { orderId: latest.id }, { force: true });
  });
}
