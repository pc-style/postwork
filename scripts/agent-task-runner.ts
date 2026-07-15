const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 9_500;
const DEFAULT_REQUEST_ATTEMPTS = 3;

type AgentTaskClaim = {
  taskId: string;
  post: { id: string; title: string; body: string };
  sourceReplyId?: string;
  prompt: string;
  agent: { id: string; name: string };
  replies: Array<{
    id: string;
    parentId?: string;
    authorId: string;
    body: string;
  }>;
  repliesTruncated: boolean;
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
};

export type RunnerConfig = {
  baseUrl: string;
  token: string;
  taskId: string;
  command: string[];
  cwd?: string;
  externalRunId?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  requestAttempts?: number;
};

type RunnerDependencies = {
  fetch: typeof fetch;
  execute: typeof executeCommand;
};

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function configuredCommand(args: string[], value: string | undefined): string[] {
  const separator = args.indexOf("--");
  if (separator >= 0) {
    const command = args.slice(separator + 1);
    if (command.length === 0) throw new Error("A command must follow --.");
    return command;
  }
  if (!value) throw new Error("Pass the coding-agent command after -- or set POSTWORK_AGENT_COMMAND_JSON.");
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((argument) => typeof argument !== "string" || argument.length === 0)
  ) {
    throw new Error("POSTWORK_AGENT_COMMAND_JSON must be a non-empty JSON string array.");
  }
  return parsed;
}

export function configFromEnvironment(
  args: string[],
  env: Record<string, string | undefined>,
): RunnerConfig {
  const separator = args.indexOf("--");
  const positional = separator >= 0 ? args.slice(0, separator) : args;
  const taskId = positional[0] ?? env.POSTWORK_AGENT_TASK_ID;
  return {
    baseUrl: required(env.POSTWORK_URL, "POSTWORK_URL").replace(/\/+$/, ""),
    token: required(env.POSTWORK_CONNECTOR_TOKEN, "POSTWORK_CONNECTOR_TOKEN"),
    taskId: required(taskId, "Task ID"),
    command: configuredCommand(args, env.POSTWORK_AGENT_COMMAND_JSON),
    cwd: env.POSTWORK_AGENT_CWD,
    model: env.POSTWORK_AGENT_MODEL,
    externalRunId: env.POSTWORK_EXTERNAL_RUN_ID,
    timeoutMs: positiveInteger(
      env.POSTWORK_AGENT_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      "POSTWORK_AGENT_TIMEOUT_MS",
    ),
    maxOutputBytes: positiveInteger(
      env.POSTWORK_AGENT_MAX_OUTPUT_BYTES,
      DEFAULT_MAX_OUTPUT_BYTES,
      "POSTWORK_AGENT_MAX_OUTPUT_BYTES",
    ),
  };
}

export function externalRunIdFor(taskId: string): string {
  return `postwork-${taskId}`.slice(0, 200);
}

function isClaim(value: unknown): value is AgentTaskClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<AgentTaskClaim>;
  return (
    typeof claim.taskId === "string" &&
    typeof claim.prompt === "string" &&
    typeof claim.post?.title === "string" &&
    typeof claim.post.body === "string" &&
    typeof claim.agent?.name === "string" &&
    Array.isArray(claim.replies)
  );
}

export function formatAgentInput(claim: AgentTaskClaim): string {
  const replies = claim.replies.length
    ? claim.replies.map((reply) =>
      `- reply ${reply.id} by ${reply.authorId}${reply.parentId ? ` to ${reply.parentId}` : ""}: ${reply.body}`
    ).join("\n")
    : "(no replies)";
  const truncation = claim.repliesTruncated
    ? "\nThe reply window was truncated. Base the response on the available context."
    : "";
  return [
    `You are ${claim.agent.name}, a coding agent responding to a Postwork task.`,
    "Complete the task using the current working directory. Return only the concise response that should be posted to the thread.",
    "",
    `POST: ${claim.post.title}`,
    claim.post.body,
    "",
    "REPLIES:",
    replies + truncation,
    "",
    "TASK:",
    claim.prompt,
  ].join("\n");
}

async function readBounded(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let kept = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (kept < maxBytes) {
      const remaining = maxBytes - kept;
      const chunk = value.byteLength <= remaining ? value : value.subarray(0, remaining);
      chunks.push(chunk);
      kept += chunk.byteLength;
      if (value.byteLength > remaining) truncated = true;
    } else if (value.byteLength > 0) {
      truncated = true;
    }
  }
  const combined = new Uint8Array(kept);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(combined), truncated };
}

export async function executeCommand(
  command: string[],
  input: string,
  options: { cwd?: string; timeoutMs: number; maxOutputBytes: number },
): Promise<CommandResult> {
  const process = Bun.spawn(command, {
    cwd: options.cwd,
    env: processEnv(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  process.stdin.write(input);
  process.stdin.end();

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill(9);
  }, options.timeoutMs);
  const stdoutPromise = readBounded(process.stdout, options.maxOutputBytes);
  const stderrPromise = readBounded(process.stderr, options.maxOutputBytes);
  const exitCode = await process.exited;
  clearTimeout(timeout);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    exitCode,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    timedOut,
  };
}

function processEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...Bun.env };
  delete env.POSTWORK_CONNECTOR_TOKEN;
  return env;
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  body: unknown,
  attempts: number,
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts) throw lastError;
      continue;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload;
    const error = new Error(`Postwork returned HTTP ${response.status}.`);
    if (response.status < 500 || attempt === attempts) throw error;
    lastError = error;
  }
  throw lastError ?? new Error("Postwork request failed.");
}

function boundedFailure(result: CommandResult, timeoutMs: number): string {
  if (result.timedOut) return `Coding-agent command timed out after ${timeoutMs} ms.`;
  const detail = (result.stderr || result.stdout).trim().slice(0, 850);
  return `Coding-agent command exited with code ${result.exitCode}.${detail ? ` ${detail}` : ""}`;
}

export async function runAgentTask(
  config: RunnerConfig,
  dependencies: RunnerDependencies = { fetch, execute: executeCommand },
): Promise<{ status: "done" | "failed"; externalRunId: string }> {
  if (config.command.length === 0) throw new Error("Coding-agent command is required.");
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const externalRunId = config.externalRunId?.trim() || externalRunIdFor(config.taskId);
  const attempts = config.requestAttempts ?? DEFAULT_REQUEST_ATTEMPTS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = Math.min(
    config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    DEFAULT_MAX_OUTPUT_BYTES,
  );
  const claimPayload = await postJson(
    dependencies.fetch,
    `${baseUrl}/api/connectors/agent-tasks/claim`,
    config.token,
    { taskId: config.taskId, externalRunId },
    attempts,
  );
  if (!isClaim(claimPayload)) throw new Error("Postwork returned an invalid task claim.");

  const commandResult = await dependencies.execute(
    config.command,
    formatAgentInput(claimPayload),
    { cwd: config.cwd, timeoutMs, maxOutputBytes },
  );
  const output = commandResult.stdout.trim();
  const successful = commandResult.exitCode === 0 && !commandResult.timedOut && output.length > 0;
  const outcome = successful
    ? {
        status: "done" as const,
        body: commandResult.stdoutTruncated ? `${output}\n\n[output truncated]` : output,
        model: config.model,
      }
    : {
        status: "failed" as const,
        error: output.length === 0 && commandResult.exitCode === 0 && !commandResult.timedOut
          ? "Coding-agent command returned no output."
          : boundedFailure(commandResult, timeoutMs),
      };
  await postJson(
    dependencies.fetch,
    `${baseUrl}/api/connectors/agent-tasks/result`,
    config.token,
    { taskId: config.taskId, externalRunId, ...outcome },
    attempts,
  );
  return { status: outcome.status, externalRunId };
}

async function main(): Promise<void> {
  const config = configFromEnvironment(Bun.argv.slice(2), Bun.env);
  const result = await runAgentTask(config);
  console.log(`${result.status} ${result.externalRunId}`);
  if (result.status === "failed") process.exitCode = 1;
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
