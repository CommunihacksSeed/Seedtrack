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
    },
  }),
});
