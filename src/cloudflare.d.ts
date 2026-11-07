declare module "cloudflare:workers" {
  export const env: { DB: import("@cloudflare/workers-types").D1Database };
}

/** Set at build time in vite.config.ts; changes with every deployment. */
declare const __SEEDFLOW_BUILD__: string;
