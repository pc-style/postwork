import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

/**
 * Convex app configuration.
 *
 * Registers the rate-limiter component (Phase 3.1) and declares typed
 * environment variables so backend code reads them via `env` instead of
 * raw `process.env` where it matters.
 */
const app = defineApp({
  env: {
    // AI provider — see convex/ai.ts resolveModel().
    AI_PROVIDER: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    OPENAI_MODEL: v.optional(v.string()),
    AI_GATEWAY_API_KEY: v.optional(v.string()),
    AI_GATEWAY_MODEL: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
    OPENROUTER_MODEL: v.optional(v.string()),
    OPENROUTER_BASE_URL: v.optional(v.string()),
    PIONEER_API_KEY: v.optional(v.string()),
    PIONEER_MODEL: v.optional(v.string()),
    PIONEER_BASE_URL: v.optional(v.string()),
    // Clerk JWT issuer domain for auth.config.ts verification.
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    // Demo mode flag (DEMO=true keeps the backend read-only for visitors).
    DEMO: v.optional(v.string()),
    // Resend outbound email transport. Product mode requires all three.
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_FROM_EMAIL: v.optional(v.string()),
    POSTWORK_APP_URL: v.optional(v.string()),
    // Versioned AES-GCM keyring for provider webhook secrets at rest.
    CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID: v.optional(v.string()),
    CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY: v.optional(v.string()),
    CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS: v.optional(v.string()),
  },
});

app.use(rateLimiter);

export default app;
