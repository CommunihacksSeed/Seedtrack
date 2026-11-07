import { getStore } from "@/lib/store";
import { verifyWebhook, webhookMapping } from "@/lib/integrations/cognito";
import { rowToOrderInput } from "@/lib/import-mapping";
import { errorResponse, json } from "@/lib/server/http";

/**
 * Optional webhook ingestion. Disabled (503) unless COGNITO_WEBHOOK_SECRET is
 * set, and every call must present that secret. Duplicate entry IDs are
 * ignored, so retries are safe.
 */
export async function POST(req: Request) {
  if (!process.env.COGNITO_WEBHOOK_SECRET) return json({ error: "Cognito Forms integration not configured" }, 503);
  if (!verifyWebhook(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { input, errors } = rowToOrderInput(body, webhookMapping(), "cognito-webhook");
    if (!input) return json({ error: errors.join("; ") }, 422);
    const { order, duplicate } = await getStore().createOrder(input);
    return json({ ok: true, duplicate, order_number: order.order_number });
  } catch (e) {
    return errorResponse(e);
  }
}
