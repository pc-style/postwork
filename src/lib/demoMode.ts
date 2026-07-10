function parseDemoFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }

  return true;
}

export const isDemo = parseDemoFlag(import.meta.env.VITE_DEMO);

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
