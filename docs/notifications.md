# Notification delivery semantics

Postwork's in-app unread state is the source of truth. Outbound notifications
are an optional projection of that state: composing or attempting an outbound
delivery never marks a post read, and reading a post in Postwork removes it from
future outbound composition.

## Preference defaults

Preferences are scoped to one user inside one organization. A user with no
stored preference row receives these safe defaults:

- outbound delivery: off
- immediate urgent delivery: on, ready if outbound delivery is later enabled
- digest delivery: on, ready if outbound delivery is later enabled
- quiet hours: on, 22:00-08:00 UTC

The settings surface records the browser's IANA time zone when the user first
saves preferences. Quiet-hour start and end must differ; equal values are
rejected rather than being assigned an ambiguous meaning.

## Priority and timing rules

Only items that are still unread at composition time can become candidates.
Items are de-duplicated by post, keeping the newest activity, then ordered by
priority (`urgent`, `high`, `normal`) and newest activity.

| Priority | Immediate candidate                                                                | Digest candidate                                                   |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Urgent   | Yes, when immediate urgent delivery is enabled and the user is outside quiet hours | Yes when immediate delivery is disabled or quiet hours suppress it |
| High     | Never                                                                              | Yes                                                                |
| Normal   | Never                                                                              | Yes                                                                |

Additional gates apply in this order:

1. When outbound delivery is off, composition returns no candidates.
2. Immediate candidates require the immediate urgent preference.
3. Quiet hours suppress every immediate candidate; there is no bypass.
4. Suppressed urgent items join the digest only when digest delivery is on.
5. High and normal items require digest delivery.

A composition returns at most one immediate candidate and one digest candidate.
The immediate candidate bundles up to 5 urgent items; the digest bundles up to
25 items. Both report how many additional unread items were omitted. This keeps
the provider boundary bounded and avoids one-message-per-post noise.

Quiet hours use the user's stored IANA time zone and support windows that cross
midnight. Boundary behavior is start-inclusive and end-exclusive: for
22:00-08:00, 22:00 is quiet and 08:00 is not.

## Provider choice

The first outbound transport is email through Resend. Email fits Postwork's
asynchronous catch-up model without browser permission or push-subscription
state, and the provider can be called directly from a Convex action over HTTP.
No provider SDK is required.

Each provider request carries a stable `Idempotency-Key`. Postwork stores one
delivery row per provider key before sending, then records successful, retryable,
or permanent outcomes. A sent row is never sent again. In-flight claims use a
one-minute lease so concurrent actions cannot call the provider together.

Resend retains idempotency keys for 24 hours. Postwork allows retries for 23
hours from the first attempt, which leaves a one-hour safety margin for clock
and scheduling delay. Once that window expires, Postwork permanently blocks the
key because an earlier ambiguous request may have succeeded. Every retry inside
the window reuses the original key.

Network errors, request timeouts, HTTP 408, rate limits, provider 5xx responses,
and Resend's `concurrent_idempotent_requests` conflict are retryable. The
`invalid_idempotent_request` conflict and every other 409 response are permanent.
Provider requests are aborted after 10 seconds and return a structured
`request_timeout` failure. Logs exclude recipient addresses and message bodies.

## Provider boundary and demo safety

The notification composer is transport-neutral. It produces delivery candidates
but does not send them. A separate server-only delivery boundary is the only
place a future email, web-push, or other provider adapter may be called.

That boundary applies these deployment gates before any provider call:

- when `DEMO` is enabled (including the safe default when it is unset), it
  returns `skipped_demo` and exposes no candidates to a provider adapter;
- in product mode it returns `provider_not_configured` and names missing
  configuration until every required Resend variable is set;
- before sending, it rejects read items, oversized candidates, repeated kinds,
  and any non-urgent item in an immediate candidate.

The caller must still compose from freshly checked unread state and preferences.
Delivery never changes read state. Product deployments require these Convex env
variables:

- `DEMO=false`
- `RESEND_API_KEY`, using a sending-only key when possible
- `RESEND_FROM_EMAIL`, using an address on the verified Resend domain
- `POSTWORK_APP_URL`, an absolute HTTP or HTTPS origin used for post and profile
  links. Paths, credentials, query strings, and fragments are rejected. Candidate
  links that resolve outside this origin are replaced with the canonical post URL.

Set them with `bunx convex env set NAME value`. The caller supplies the verified
member email and a stable idempotency key; neither is accepted from a public
client function. Digest scheduling and event triggers remain separate from the
transport adapter so they cannot bypass composition or preference gates.
