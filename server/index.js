import { createServer } from "node:http";
import express from "express";
import { resolve } from "node:path";
import { installBrokerProxy } from "./shared.js";
import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { loadConfig } from "./config.js";

const config = await loadConfig();
const store = await createStore(config.dataPath);
const app = createApp({ config, store });
installBrokerProxy(app, config);
const server = createServer(app);
let vite;
if (config.production) {
  app.use(express.static(resolve("dist"), { index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(config.port, config.host, () => {
  console.log(`CreatorRoom: ${config.origin} (${config.mode})`);
  if (config.mode === "demo")
    console.log(
      "LOCAL DEMO: simulated identities and browser-local WebCrypto keys. This is not TideCloak protection.",
    );
  if (config.mode === "setup")
    console.log(
      "No Tide adapter found. Read docs/TIDECLOAK.md or run npm run demo.",
    );
});
async function shutdown() {
  await vite?.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
