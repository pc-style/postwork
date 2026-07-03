import { init } from "@plausible-analytics/tracker";

const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;

if (plausibleDomain) {
  init({
    domain: plausibleDomain,
    outboundLinks: true,
  });
}
