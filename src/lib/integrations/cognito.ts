/**
 * Cognito Forms integration — adapter boundary.
 *
 * No Cognito Forms API credentials were available while building SeedFlow,
 * and we have NOT verified Cognito's REST endpoints or webhook signing scheme
 * against official documentation. So this module deliberately makes no live
 * API calls. It defines the adapter interface and configuration checks; a
 * future contributor implements `fetchEntries` once the endpoint format and
 * credentials are confirmed.
 *
 * Until then, requests come in through manual entry or CSV/JSON import
 * (same field mapping as below), which works today.
 */
import "server-only";
import { timingSafeEqual } from "crypto";
import type { Mapping } from "../import-mapping";

export interface CognitoEntry {
  /** Cognito's entry identifier, stored as orders.external_entry_id for de-duplication. */
  entryId: string;
  fields: Record<string, unknown>;
}

export interface CognitoAdapter {
  /** Fetch entries submitted after `since` (or all). Must not be called unless configured. */
  fetchEntries(since: Date | null): Promise<CognitoEntry[]>;
}

export function cognitoStatus() {
  const apiConfigured = Boolean(process.env.COGNITO_API_KEY && process.env.COGNITO_FORM_ID);
  const webhookConfigured = Boolean(process.env.COGNITO_WEBHOOK_SECRET);
  return {
    apiConfigured,
    webhookConfigured,
    message: apiConfigured
      ? "Credentials present, but live sync is not implemented until Cognito's API format is verified against official docs."
      : "Cognito Forms integration not configured",
  };
}

export class NotConfiguredError extends Error {}

/** Placeholder adapter: refuses to guess endpoints. */
export const cognitoAdapter: CognitoAdapter = {
  async fetchEntries() {
    throw new NotConfiguredError(cognitoStatus().message);
  },
};

/**
 * Field mapping for Cognito entries arriving via webhook. Override with
 * COGNITO_FIELD_MAPPING (JSON object of SeedFlow field → Cognito field name).
 */
export function webhookMapping(): Mapping {
  const fallback: Mapping = {
    external_entry_id: "Id",
    requester_name: "YourName",
    requester_email: "Email",
    organization_name: "School",
    mailing_address: "MailingAddress",
    requested_bundles: "Bundles",
    requested_seeds: "SeedTypes",
    special_requests: "SpecialRequests",
    student_count: "NumberOfStudents",
  };
  try {
    return process.env.COGNITO_FIELD_MAPPING ? JSON.parse(process.env.COGNITO_FIELD_MAPPING) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Shared-secret check for the webhook endpoint. The secret is sent as the
 * `x-seedflow-webhook-secret` header or a `token` query parameter (configure
 * it in the webhook URL). Replace with the provider's documented signature
 * verification if Cognito offers one.
 */
export function verifyWebhook(req: Request): boolean {
  const secret = process.env.COGNITO_WEBHOOK_SECRET;
  if (!secret) return false;
  const sent = req.headers.get("x-seedflow-webhook-secret") ?? new URL(req.url).searchParams.get("token") ?? "";
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
