import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "f093ecdd8efe598178dcd27a14e0e3c1",
  worker: defineWorker({
    name: "seedflow",
    domains: ["seedflow.space"],
    workersDev: true,
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-07",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ id: "94072807-2577-41ea-b804-8ca9b20210ee", name: "seedflow" }),
      SEEDFLOW_DISABLE_DEMO_RESET: bindings.text("true"),
      APP_URL: bindings.text("https://seedflow.space"),
      // One-time code for creating the first staff account at /login (only while no accounts exist).
      // Only the SHA-256 is here; the code itself was given to the team privately. It stops working
      // once any staff account exists, so it's safe to leave in place.
      SEEDFLOW_SETUP_CODE_SHA256: bindings.text("ab7f1d5af855e05d31c85e78a3b00e939038569739fd3cad1b42de058129f967"),
      // Shared abuse brake for the public request form: 20 submissions per IP per 60 seconds.
      // Not yet exercised by a real deployment; if a deploy rejects this binding, remove this line
      // and the form falls back to its best-effort in-memory limit.
      PUBLIC_FORM_LIMITER: bindings.rateLimit({ namespace: "7301", simple: { limit: 20, period: 60 } }),
    },
  }),
});
