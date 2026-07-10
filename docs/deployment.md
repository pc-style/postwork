# Deployment and observability

Postwork has two deliberately separate Vercel + Convex deployments. The public
demo is seeded and anonymous; the product deployment is authenticated. Never
point both frontend environments at the same Convex deployment.

Vercel uses the committed build command:

```bash
bunx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'bun run build'
```

It deploys the Convex project selected by `CONVEX_DEPLOY_KEY`, then injects that
deployment's URL into the Vite build as `VITE_CONVEX_URL`.

## Vercel environment matrix

Configure each value in the matching Vercel project/environment. Do not share a
`CONVEX_DEPLOY_KEY` across the demo and product deployments.

| Variable | Public demo (`postwork.pcstyle.dev`) | Product | Notes |
| --- | --- | --- | --- |
| `VITE_DEMO` | `true` | `false` | Required explicitly so the build and frontend agree about their mode. |
| `VITE_CONVEX_URL` | Injected by the build command from the demo Convex deployment | Injected by the build command from the product Convex deployment | Do not manually pin it in Vercel when using the committed build command. For local builds, `bunx convex dev` writes it to `.env.local`. |
| `CONVEX_DEPLOY_KEY` | Demo deployment key | Product deployment key | Server-side Vercel secret; never prefix with `VITE_`. |
| `VITE_PLAUSIBLE_DOMAIN` | `postwork.pcstyle.dev` | **unset** | The client also checks demo mode and the actual hostname before initializing Plausible. Product analytics policy is intentionally unset. |
| `VITE_SENTRY_DSN` | Optional public Sentry DSN for the demo project | Optional public Sentry DSN for the product project | Leaving it unset disables Sentry fully; no monitoring client is initialized or contacted. A browser DSN is safe to expose, but must be project-scoped. |
| `VITE_SENTRY_ENVIRONMENT` | Recommended: `demo` | Recommended: `production` | Optional explicit Sentry environment label. Without it, demo defaults to `demo` and product uses Vite's build mode. |
| `VITE_SENTRY_RELEASE` | Optional immutable release identifier | Optional immutable release identifier | Set this when a release identifier is available (for example, the commit SHA supplied by your deployment process). |

The browser Sentry client tags all reports with `postwork.mode` (`demo` or
`product`), Sentry environment, and release when configured. Its default browser
global-handler integration captures uncaught errors and unhandled promise
rejections. The existing React `ErrorBoundary` keeps its current fallback UI and
also captures its exceptions with the component stack.

No server-side Sentry integration is configured: Convex structured logging in
`convex/lib/observability.ts` remains the backend source of truth, and this keeps
the local anonymous Convex workflow credential-free.

## Local verification

```bash
bun install
bun run test:observability
bun run verify:builds
```

`verify:builds` runs the default demo build and an explicit
`VITE_DEMO=false` product build. Neither command needs a Sentry DSN; absent
monitoring credentials are an expected, supported local configuration.
