const demo = process.env.VITE_DEMO;
const demoConvexUrl = process.env.DEMO_CONVEX_URL;
const productConvexUrl = process.env.PRODUCT_CONVEX_URL;
const frontendConvexUrl = process.env.VITE_CONVEX_URL;

function requireConvexDeploymentUrl(name, value) {
  if (!value) {
    throw new Error(`${name} must be set to a Convex deployment URL.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS Convex deployment URL.`);
  }

  const hostnameLabel = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
  const isConvexHost = new RegExp(
    `^${hostnameLabel}(?:\\.${hostnameLabel})?\\.convex\\.cloud$`,
    "i",
  ).test(url.hostname);
  if (
    url.protocol !== "https:" ||
    url.port ||
    !isConvexHost ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    value.trim() !== value
  ) {
    throw new Error(`${name} must be a valid HTTPS Convex deployment URL.`);
  }

  return url.origin;
}

if (demo !== "true" && demo !== "false") {
  throw new Error(
    "VITE_DEMO must be explicitly set to true or false for deployment builds.",
  );
}

const demoDeployment = requireConvexDeploymentUrl(
  "DEMO_CONVEX_URL",
  demoConvexUrl,
);
const productDeployment = requireConvexDeploymentUrl(
  "PRODUCT_CONVEX_URL",
  productConvexUrl,
);
requireConvexDeploymentUrl(
  "VITE_CONVEX_URL",
  frontendConvexUrl,
);

if (demoDeployment === productDeployment) {
  throw new Error(
    "DEMO_CONVEX_URL and PRODUCT_CONVEX_URL must be different deployments.",
  );
}

const expectedFrontendUrl = demo === "true" ? demoConvexUrl : productConvexUrl;
if (frontendConvexUrl !== expectedFrontendUrl) {
  throw new Error(
    `VITE_CONVEX_URL must exactly match ${
      demo === "true" ? "DEMO_CONVEX_URL" : "PRODUCT_CONVEX_URL"
    } for VITE_DEMO=${demo}.`,
  );
}

if (demo === "false" && !process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required when VITE_DEMO=false.");
}
