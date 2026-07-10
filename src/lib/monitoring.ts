export const PUBLIC_DEMO_DOMAIN = "postwork.pcstyle.dev";

type SentryConfigurationInput = {
  dsn?: string;
  environment?: string;
  release?: string;
  isDemo: boolean;
  viteMode: string;
};

export type SentryConfiguration = {
  dsn: string;
  environment: string;
  release?: string;
  mode: "demo" | "product";
};

function getTrimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * Produces a browser-safe Sentry configuration. A DSN is intentionally the
 * opt-in switch: without one, local development does not initialize a client
 * or attempt any monitoring network traffic.
 */
export function getSentryConfiguration(
  input: SentryConfigurationInput,
): SentryConfiguration | undefined {
  const dsn = getTrimmedValue(input.dsn);
  if (!dsn) return undefined;

  const mode = input.isDemo ? "demo" : "product";

  return {
    dsn,
    environment:
      getTrimmedValue(input.environment) ??
      (input.isDemo ? "demo" : input.viteMode),
    release: getTrimmedValue(input.release),
    mode,
  };
}

/**
 * Plausible belongs exclusively to the public demo. Requiring the configured
 * domain and the live hostname prevents accidental local, preview, or product
 * analytics when a shared environment variable leaks into another deployment.
 */
export function shouldInitializePlausible(input: {
  isDemo: boolean;
  configuredDomain?: string;
  hostname: string;
}): boolean {
  return (
    input.isDemo &&
    getTrimmedValue(input.configuredDomain) === PUBLIC_DEMO_DOMAIN &&
    input.hostname === PUBLIC_DEMO_DOMAIN
  );
}
