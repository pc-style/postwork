const buildModes = [
  {
    name: "explicit demo build",
    viteDemo: "true",
    viteConvexUrl: "https://postwork-demo.convex.cloud",
  },
  {
    name: "explicit product build",
    viteDemo: "false",
    viteConvexUrl: "https://postwork-product.convex.cloud",
  },
];

for (const build of buildModes) {
  console.log(`\n==> ${build.name}`);
  const environment = {
    ...process.env,
    DEMO_CONVEX_URL: "https://postwork-demo.convex.cloud",
    PRODUCT_CONVEX_URL: "https://postwork-product.convex.cloud",
    VITE_DEMO: build.viteDemo,
    VITE_CONVEX_URL: build.viteConvexUrl,
    VITE_CLERK_PUBLISHABLE_KEY: "pk_test_build_verification",
  };

  for (const command of [
    ["bun", "run", "validate:deploy-env"],
    ["bun", "run", "build"],
  ]) {
    const result = Bun.spawnSync({
      cmd: command,
      cwd: import.meta.dir + "/..",
      env: environment,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    if (result.exitCode !== 0) {
      process.exit(result.exitCode ?? 1);
    }
  }
}
