/**
 * Email-domain rules for workspace auto-join. Public mailbox providers can
 * never be claimed — otherwise one workspace could hoover up every gmail
 * sign-up on the deployment.
 */

const PUBLIC_EMAIL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me", "aol.com", "gmx.com", "gmx.net",
  "mail.com", "yandex.com", "yandex.ru", "zoho.com", "hey.com",
  "fastmail.com", "duck.com", "tutanota.com", "tuta.io", "mail.ru",
  "qq.com", "163.com", "126.com", "naver.com", "web.de", "t-online.de",
]);

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function emailDomain(email: string | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DOMAIN_RE.test(domain) ? domain : null;
}

export function isPublicEmailProvider(domain: string): boolean {
  return PUBLIC_EMAIL_PROVIDERS.has(domain.toLowerCase());
}

/** Validation for an admin-claimed auto-join domain. Returns an error or null. */
export function claimableDomainError(
  domain: string,
  adminEmail: string | undefined,
): string | null {
  const normalized = domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(normalized)) {
    return "Enter a bare domain like acme.com.";
  }
  if (isPublicEmailProvider(normalized)) {
    return "Public email providers can't auto-join a workspace.";
  }
  const adminDomain = emailDomain(adminEmail);
  if (!adminDomain || adminDomain !== normalized) {
    return "Your own account email must be on that domain to claim it.";
  }
  return null;
}
