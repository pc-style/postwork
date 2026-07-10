const buildModes = [
  { name: "default demo build", viteDemo: undefined },
  { name: "explicit product build", viteDemo: "false" },
];

for (const build of buildModes) {
  console.log(`\n==> ${build.name}`);
  const environment = { ...process.env };
  if (build.viteDemo === undefined) {
    delete environment.VITE_DEMO;
  } else {
    environment.VITE_DEMO = build.viteDemo;
  }

  const result = Bun.spawnSync({
    cmd: ["bun", "run", "build"],
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
