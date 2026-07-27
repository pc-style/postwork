import { describe, expect, test } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const demoUrl = "https://postwork-demo.convex.cloud";
const productUrl = "https://postwork-product.convex.cloud";

type DeployEnvironment = Record<string, string | undefined>;

function validate(overrides: DeployEnvironment = {}) {
  const environment: DeployEnvironment = {
    ...process.env,
    DEMO_CONVEX_URL: demoUrl,
    PRODUCT_CONVEX_URL: productUrl,
    VITE_DEMO: "true",
    VITE_CONVEX_URL: demoUrl,
    VITE_CLERK_PUBLISHABLE_KEY: "pk_test_deploy_env",
    ...overrides,
  };

  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete environment[name];
  }

  return Bun.spawnSync({
    cmd: ["bun", "run", "scripts/validate-deploy-env.mjs"],
    cwd: root,
    env: environment as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
  });
}

function errorText(result: ReturnType<typeof validate>) {
  return result.stderr.toString();
}

describe("deployment environment contract", () => {
  test("accepts matching demo and product deployments", () => {
    expect(validate().exitCode).toBe(0);
    expect(
      validate({ VITE_DEMO: "false", VITE_CONVEX_URL: productUrl }).exitCode,
    ).toBe(0);
  });

  test("accepts regional Convex deployment hosts", () => {
    const regionalDemoUrl =
      "https://postwork-demo.eu-west-1.convex.cloud";
    const regionalProductUrl =
      "https://postwork-product.eu-west-1.convex.cloud";

    expect(
      validate({
        DEMO_CONVEX_URL: regionalDemoUrl,
        PRODUCT_CONVEX_URL: regionalProductUrl,
        VITE_CONVEX_URL: regionalDemoUrl,
      }).exitCode,
    ).toBe(0);
  });

  test.each(["DEMO_CONVEX_URL", "PRODUCT_CONVEX_URL"])(
    "rejects missing %s",
    (name) => {
      const result = validate({ [name]: undefined });
      expect(result.exitCode).not.toBe(0);
      expect(errorText(result)).toContain(`${name} must be set`);
    },
  );

  test("rejects identical expected deployments", () => {
    const result = validate({ PRODUCT_CONVEX_URL: `${demoUrl}/` });
    expect(result.exitCode).not.toBe(0);
    expect(errorText(result)).toContain("must be different deployments");
  });

  test.each([
    ["true", productUrl, "DEMO_CONVEX_URL"],
    ["false", demoUrl, "PRODUCT_CONVEX_URL"],
  ])("rejects a swapped frontend deployment in mode %s", (mode, url, expected) => {
    const result = validate({ VITE_DEMO: mode, VITE_CONVEX_URL: url });
    expect(result.exitCode).not.toBe(0);
    expect(errorText(result)).toContain(`must exactly match ${expected}`);
  });

  test("requires an exact string match for the selected deployment", () => {
    const result = validate({ VITE_CONVEX_URL: `${demoUrl}/` });
    expect(result.exitCode).not.toBe(0);
    expect(errorText(result)).toContain("must exactly match DEMO_CONVEX_URL");
  });

  test.each([
    ["DEMO_CONVEX_URL", "http://postwork-demo.convex.cloud"],
    ["DEMO_CONVEX_URL", "https://postwork-demo.convex.cloud:444"],
    ["DEMO_CONVEX_URL", "https://too.deep.postwork-demo.convex.cloud"],
    ["PRODUCT_CONVEX_URL", "https://example.com"],
    ["VITE_CONVEX_URL", "not-a-url"],
  ])("rejects invalid deployment URL in %s", (name, value) => {
    const result = validate({ [name]: value });
    expect(result.exitCode).not.toBe(0);
    expect(errorText(result)).toContain(
      `${name} must be a valid HTTPS Convex deployment URL`,
    );
  });

  test("rejects missing Clerk configuration in product mode", () => {
    const result = validate({
      VITE_DEMO: "false",
      VITE_CONVEX_URL: productUrl,
      VITE_CLERK_PUBLISHABLE_KEY: undefined,
    });
    expect(result.exitCode).not.toBe(0);
    expect(errorText(result)).toContain(
      "VITE_CLERK_PUBLISHABLE_KEY is required when VITE_DEMO=false",
    );
  });

  test("rejects an invalid mode", () => {
    const result = validate({ VITE_DEMO: "demo" });
    expect(result.exitCode).not.toBe(0);
    expect(errorText(result)).toContain("VITE_DEMO must be explicitly set");
  });
});
