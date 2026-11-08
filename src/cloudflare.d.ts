declare module "cloudflare:workers" {
  export const env: {
    DB: import("@cloudflare/workers-types").D1Database;
    /** Cloudflare Workers Rate Limiting binding. Optional: absent in local dev and until it is added to cloudflare.config.ts. */
    PUBLIC_FORM_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  };
}

/** Set at build time in vite.config.ts; changes with every deployment. */
declare const __SEEDFLOW_BUILD__: string;
