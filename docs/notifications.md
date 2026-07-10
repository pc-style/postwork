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

## Provider boundary and demo safety

The notification composer is transport-neutral. It produces delivery candidates
but does not send them. A separate server-only delivery boundary is the only
place a future email, web-push, or other provider adapter may be called.

That boundary is deliberately a no-op in this foundation:

- when `DEMO` is enabled (including the safe default when it is unset), it
  returns `skipped_demo` and exposes no candidates to a provider adapter;
- in product mode it returns `provider_not_configured` until a transport is
  explicitly implemented.

No provider SDK, address collection, VAPID key, push subscription, cron, or
scheduler is part of this foundation. A later transport integration must retain
the demo guard, re-check unread state immediately before composition, schedule
digests explicitly, and add delivery/idempotency records before performing
external side effects.
