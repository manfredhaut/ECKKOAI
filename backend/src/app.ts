import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import session from "@fastify/session";
import staticFiles from "@fastify/static";
import { config } from "./config.js";
import { BASE_DOMAIN } from "./domainConfig.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { resolveTenantFromHost } from "./middleware/resolveTenantFromHost.js";
import { PgSessionStore } from "./services/sessionStore.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { adminAuthRoutes } from "./routes/adminAuth.js";
import { loginRoutes } from "./routes/login.js";
import { adminPanelRoutes } from "./routes/adminPanel.js";
import { adminCopilotRoutes } from "./routes/adminCopilot.js";
import { adminPlatformCredentialRoutes } from "./routes/adminPlatformCredentials.js";
import { requireAdmin } from "./middleware/requireAdmin.js";
import { avatarRoutes } from "./routes/avatars.js";
import { voiceRoutes } from "./routes/voice.js";
import { videoRoutes } from "./routes/videos.js";
import { credentialRoutes } from "./routes/credentials.js";
import { scriptRoutes } from "./routes/scripts.js";
import { uploadRoutes } from "./routes/uploads.js";
import { documentRoutes } from "./routes/documents.js";
import { referenceImageRoutes } from "./routes/referenceImages.js";
import { notificationRoutes } from "./routes/notifications.js";
import { jobRoutes } from "./routes/jobs.js";
import { copilotRoutes } from "./routes/copilot.js";
import { subscriptionRoutes } from "./routes/subscription.js";
import { storageRoutes } from "./routes/storage.js";
import { featureFlagRoutes } from "./routes/featureFlags.js";
import { publicRoutes } from "./routes/public.js";
import { stripeWebhookRoutes } from "./routes/stripeWebhook.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart);
  await app.register(staticFiles, {
    root: config.uploadsDir,
    prefix: "/uploads/",
  });

  await app.register(cookie);
  await app.register(session, {
    secret: config.sessionSecret,
    store: new PgSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      // Shared between the root domain and every tenant subdomain, so a
      // session started on {slug}.BASE_DOMAIN (or the root domain) stays
      // valid across both. Consequence: plain "localhost" no longer keeps
      // a session (its Host doesn't match this cookie's domain) — local
      // access must go through BASE_DOMAIN / its subdomains (see docs/setup.md).
      domain: `.${BASE_DOMAIN}`,
    },
  });

  app.addHook("preHandler", resolveTenantFromHost);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(adminAuthRoutes);
  await app.register(loginRoutes);
  await app.register(publicRoutes);
  // Own encapsulation context — its addContentTypeParser override (raw
  // buffer, needed for Stripe signature verification) doesn't leak into any
  // other route. Public: Stripe calls it directly, no session cookie.
  await app.register(stripeWebhookRoutes);

  // Everything below requires a logged-in session, scoped to the caller's tenant.
  await app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", requireAuth);
    await protectedApp.register(avatarRoutes);
    await protectedApp.register(voiceRoutes);
    await protectedApp.register(videoRoutes);
    await protectedApp.register(credentialRoutes);
    await protectedApp.register(uploadRoutes);
    await protectedApp.register(scriptRoutes);
    await protectedApp.register(documentRoutes);
    await protectedApp.register(referenceImageRoutes);
    await protectedApp.register(notificationRoutes);
    await protectedApp.register(jobRoutes);
    await protectedApp.register(copilotRoutes);
    await protectedApp.register(subscriptionRoutes);
    await protectedApp.register(storageRoutes);
    await protectedApp.register(featureFlagRoutes);
  });

  // Cross-tenant admin routes — gated by requireAdmin (admin_users session),
  // completely separate from the tenant-protected block above.
  await app.register(async (adminApp) => {
    adminApp.addHook("preHandler", requireAdmin);
    await adminApp.register(adminPanelRoutes);
    await adminApp.register(adminCopilotRoutes);
    await adminApp.register(adminPlatformCredentialRoutes);
  });

  return app;
}
