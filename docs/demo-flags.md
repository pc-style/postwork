# Demo and lab policy

The frontend has one build-time mode switch, `VITE_DEMO`, and one small policy
helper at [`src/lib/demoMode.ts`](../src/lib/demoMode.ts). The helper is the
owner of demo-only product decisions; individual surfaces should consume its
typed policy rather than read environment values or invent a second flag.

| Decision | Demo default | Product mode | Owner |
| --- | --- | --- | --- |
| public demo banner | on | off | `demoPolicy.publicDemoBanner` + `RedesignShell` |
| flash experiments lab | on | off | `demoPolicy.flashExperimentsLab` + `router.tsx` |
| seeded teammate switcher | on | off | `demoPolicy.userSwitcher` + app shell |
| session overlay writes | on | off | `demoPolicy.sessionOverlay` + `src/lib/store.tsx` |
| product authentication | off | on | `demoPolicy.productAuth` + route/provider gates |
| admin control plane | off | on | `demoPolicy.productAuth` + admin route/navigation gates |

`VITE_DEMO` defaults to demo mode when unset. `false`, `0`, and `off` select
product mode. The backend has a separate `DEMO` environment value owned by
`convex/lib/demo.ts`; it protects backend persistence and is intentionally not
combined with frontend policy code in this lane.

The flash lab is an explicitly in-progress surface. It remains visible in the
public demo so experimental flow work can be reviewed, and remains disabled in
product mode until a future promotion changes the policy and route ownership.
