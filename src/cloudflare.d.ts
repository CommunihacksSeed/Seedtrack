declare module "cloudflare:workers" {
  export const env: {
    DB: import("@cloudflare/workers-types").D1Database;
    /** Cloudflare Workers Rate Limiting binding. Optional: absent in local dev and until it is added to cloudflare.config.ts. */
    PUBLIC_FORM_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
    /** First staff account, created on first sign-in when no accounts exist (Cloudflare secrets). */
    SEEDFLOW_SETUP_CODE_SHA256?: string;
    SEEDFLOW_ADMIN_EMAIL?: string;
    SEEDFLOW_ADMIN_PASSWORD?: string;
  };
}

/** Set at build time in vite.config.ts; changes with every deployment. */
declare const __SEEDFLOW_BUILD__: string;
