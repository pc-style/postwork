const buildModes = [
  { name: "default demo build", environment: {} },
  { name: "explicit product build", environment: { VITE_DEMO: "false" } },
];

for (const build of buildModes) {
  console.log(`\n==> ${build.name}`);
  const result = Bun.spawnSync({
    cmd: ["bun", "run", "build"],
    cwd: import.meta.dir + "/..",
    env: { ...process.env, ...build.environment },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1);
  }
}
