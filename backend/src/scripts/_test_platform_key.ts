import { resolvePlatformKey } from "../services/platformCredentialStore.js";

resolvePlatformKey("fal").then((r) => {
  console.log("RESULTADO:", JSON.stringify(r));
  process.exit(0);
}).catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
