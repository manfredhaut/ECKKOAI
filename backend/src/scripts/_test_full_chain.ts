import { getCredentialForVendor } from "../services/credentialLookup.js";
import { vendorFormatSupport } from "../services/providers/videoFormat.js";
import { vendorRequiredByTier } from "../services/video/falPipeline.js";

const TENANT = "4634c33f-528d-4564-8184-718b8816e597";

async function main() {
  const vendor = vendorRequiredByTier("normal");
  console.log("vendorRequiredByTier('normal'):", JSON.stringify(vendor));

  const credential = await getCredentialForVendor(TENANT, "avatar", vendor);
  console.log("credential:", JSON.stringify(credential));

  const support = vendorFormatSupport(credential?.vendor ?? null);
  console.log("vendorFormatSupport result:", JSON.stringify(support));
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
