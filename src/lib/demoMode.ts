export function parseDemoFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }

  return true;
}

export type DemoPolicy = Readonly<{
  mode: "demo" | "product";
  publicDemoBanner: boolean;
  flashExperimentsLab: boolean;
  userSwitcher: boolean;
  sessionOverlay: boolean;
  productAuth: boolean;
}>;

/**
 * The frontend's small, explicit demo policy. Keep demo-only surfaces here so
 * product promotion decisions do not become scattered environment checks.
 */
export function getDemoPolicy(demo: boolean): DemoPolicy {
  return {
    mode: demo ? "demo" : "product",
    publicDemoBanner: demo,
    flashExperimentsLab: demo,
    userSwitcher: demo,
    sessionOverlay: demo,
    productAuth: !demo,
  };
}

const configuredDemo =
  typeof import.meta.env === "undefined" ? undefined : import.meta.env.VITE_DEMO;

export const isDemo = parseDemoFlag(configuredDemo);
export const demoPolicy = getDemoPolicy(isDemo);
export const DEMO_BANNER_MESSAGE =
  "public demo — data resets, pick a teammate";

export function getRequiredViteEnv(
  key: keyof Pick<ImportMetaEnv, "VITE_CONVEX_URL">,
): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`${key} is not set. Run \`bunx convex dev\` to create a deployment.`);
  }

  return value;
}

export function getOptionalViteEnv(
  key: keyof Pick<
    ImportMetaEnv,
    "VITE_PLAUSIBLE_DOMAIN" | "VITE_CLERK_PUBLISHABLE_KEY"
  >,
): string | undefined {
  return import.meta.env[key];
}

export function getRequiredProductViteEnv(
  key: keyof Pick<ImportMetaEnv, "VITE_CLERK_PUBLISHABLE_KEY">,
): never {
  throw new Error(`${key} is required when VITE_DEMO=false.`);
}
