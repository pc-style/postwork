# Connector contract

The connector layer extends the existing agent-task lifecycle. It does not add
another way to author content.

Every connector is owned by one organization and maps to one `users` row with
`isAgent: true`. That user is the actor on connector audit entries and the
author of any result reply. Connector credentials never accept an organization
or agent ID, so authorization is derived from the credential or from a verified
provider adapter.

## Agent task runners

An `agentTasks` connector uses a one-time bearer credential returned by
`api.connectors.provision`. When a teammate creates a task for its mapped agent,
the task stores `connectorId` and remains `queued`; the simulated runner is used
only for agent users without a connector.

The runner contract is two idempotent HTTP calls:

- `POST /api/connectors/agent-tasks/claim` with `{ taskId, externalRunId }`
  changes `queued` to `running` and returns the bounded post/reply context.
- `POST /api/connectors/agent-tasks/result` with the same IDs and either
  `{ status: "done", body, model? }` or `{ status: "failed", error }` finishes
  the task. A successful result creates one reply as the mapped agent in the
  same transaction as the terminal task update.

Both calls use `Authorization: Bearer pwc.<credentialId>.<secret>`. Only the
SHA-256 secret digest is stored. Revocation disables the credential and
deactivates its agent user without deleting prior tasks, replies, or audit rows.

## Inbound event adapters

An `inboundEvents` connector uses `providerSignature` authentication. The
provider-specific HTTP action must verify its webhook signature before calling
`internal.connectors.recordInboundEvent`. The mutation derives the organization
and agent from the connector, reserves `(connectorId, externalEventId)` once,
and records a payload-free audit entry.

GitHub and deploy adapters can build routing after that reservation, but they
must create a normal post or agent task attributed to the mapped agent. Raw
webhook payloads and direct unaudited replies stay outside this boundary.
