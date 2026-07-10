import { describe, expect, test } from "bun:test";
import {
  getSafeRouteTag,
  getSentryConfiguration,
  PUBLIC_DEMO_DOMAIN,
  shouldInitializePlausible,
} from "./monitoring";

describe("browser observability policy", () => {
  test("does not configure Sentry without an explicit DSN", () => {
    expect(
      getSentryConfiguration({
        isDemo: true,
        viteMode: "development",
      }),
    ).toBeUndefined();
  });

  test("tags a configured client with its mode, environment, and release", () => {
    expect(
      getSentryConfiguration({
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "preview",
        release: "postwork@abc123",
        isDemo: false,
        viteMode: "production",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "preview",
      release: "postwork@abc123",
      mode: "product",
    });
  });

  test("only enables Plausible on the public demo hostname", () => {
    expect(
      shouldInitializePlausible({
        isDemo: true,
        configuredDomain: PUBLIC_DEMO_DOMAIN,
        hostname: PUBLIC_DEMO_DOMAIN,
      }),
    ).toBe(true);
    expect(
      shouldInitializePlausible({
        isDemo: false,
        configuredDomain: PUBLIC_DEMO_DOMAIN,
        hostname: PUBLIC_DEMO_DOMAIN,
      }),
    ).toBe(false);
    expect(
      shouldInitializePlausible({
        isDemo: true,
        configuredDomain: PUBLIC_DEMO_DOMAIN,
        hostname: "localhost",
      }),
    ).toBe(false);
  });

  test("redacts identifiers from error-reporting route tags", () => {
    expect(getSafeRouteTag("/join/secret-invite-code")).toBe("/join/:code");
    expect(getSafeRouteTag("/app/posts/post_123")).toBe("/app/posts/:postId");
    expect(getSafeRouteTag("/unexpected/private/value")).toBe("unknown");
    expect(getSafeRouteTag("/admin")).toBe("/admin");
  });
});
