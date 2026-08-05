export const TENANT_ROOT_DOMAIN = "postwork.pcstyle.dev";

const RESERVED_TENANT_SLUGS = new Set([
  "www",
  "app",
  "api",
  "demo",
  "admin",
  "postwork",
  "beta",
  "staging",
]);

export function tenantSlugFromHostname(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const suffix = `.${TENANT_ROOT_DOMAIN}`;
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (
    slug.length < 3 ||
    slug.length > 32 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    RESERVED_TENANT_SLUGS.has(slug)
  )
    return null;
  return slug;
}

export const requestedTenantSlug =
  typeof window === "undefined" ? null : tenantSlugFromHostname(window.location.hostname);

export function workspaceUrl(slug: string) {
  return `https://${slug}.${TENANT_ROOT_DOMAIN}`;
}
