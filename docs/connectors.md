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

### Running a coding agent

Provision an `agentTasks` connector through `api.connectors.provision` and save
the returned token when it is shown. A task created for that connector's agent
stays queued and returns its task ID to the caller. Run that task from the repo
that the coding agent should inspect:

```bash
POSTWORK_URL=https://your-deployment.convex.site \
POSTWORK_CONNECTOR_TOKEN=pwc.<credentialId>.<secret> \
bun run agent:run <taskId> -- <agent-command> <argument> ...
```

The runner claims the task, sends the bounded thread context and request to the
command on stdin, captures its output, and submits the result through the same
task lifecycle. It executes the command as an argument vector without a shell.
The default timeout is ten minutes and stdout is capped below the reply limit;
change the timeout or lower the cap with `POSTWORK_AGENT_TIMEOUT_MS` and
`POSTWORK_AGENT_MAX_OUTPUT_BYTES`. Set `POSTWORK_AGENT_CWD` to choose the repo,
`POSTWORK_AGENT_MODEL` to record a model label, or
`POSTWORK_AGENT_COMMAND_JSON` to configure the command as a JSON string array
instead of passing it after `--`.

The default external run ID is deterministic from the task ID, so retried claims
and result submissions use the existing idempotency contract. The token binds
the run to one connected agent. Unconnected demo agents continue to use the
internal simulator.

## Inbound event adapters

An `inboundEvents` connector uses `providerSignature` authentication. The
provider-specific HTTP action must verify its webhook signature before calling
`internal.connectors.recordInboundEvent`. The mutation derives the organization
and agent from the connector, reserves `(connectorId, externalEventId)` once,
and records a payload-free audit entry.

GitHub and deploy adapters can build routing after that reservation, but they
must create a normal post or agent task attributed to the mapped agent. Raw
webhook payloads and direct unaudited replies stay outside this boundary.

GitHub sends webhooks to `POST /api/connectors/github?connector=<connector-id>`.
Provisioning returns the webhook secret once; the connector stores only its
digest and an AES-GCM encrypted copy used for HMAC verification. Deployments
must set `CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID` to a stable identifier and
`CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY` to a 32-byte hexadecimal key. Optional
`CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS` is a JSON object of up to three
retired key IDs and 32-byte hexadecimal keys. Keep all keys separate from Convex
data. Missing configuration and unknown ciphertext key IDs fail closed.

To rotate keys safely:

1. Add the current active key to `CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS`,
   then deploy a new active key ID and key.
2. From an authenticated admin session, call
   `api.connectors.rewrapGithubSecret` once for each GitHub connector in that
   admin's organization. The action never returns the decrypted secret.
3. After every connector reports the new key ID, remove the retired key from
   `CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS` and redeploy.

The adapter accepts issue open, reopen, and close events; pull request open,
reopen, ready-for-review, and close events; and unsuccessful completed workflow
runs. Issue and pull request events create an Engineering post. An unsuccessful
workflow run creates an anchor post and queues the mapped agent to investigate.
Other event and action combinations are rejected before a receipt is reserved.
