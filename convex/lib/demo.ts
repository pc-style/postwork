import { ConvexError } from "convex/values";

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

export function isDemo(): boolean {
  return parseDemoFlag(process.env.DEMO);
}

export function demoReadOnlyError(message = "Demo mode is read-only"): ConvexError<{
  code: "demo_read_only";
  message: string;
}> {
  return new ConvexError({
    code: "demo_read_only" as const,
    message,
  });
}

export function throwDemoReadOnly(message?: string): never {
  throw demoReadOnlyError(message);
}
