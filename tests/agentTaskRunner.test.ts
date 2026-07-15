import { describe, expect, test } from "bun:test";
import {
  executeCommand,
  externalRunIdFor,
  runAgentTask,
  type RunnerConfig,
} from "../scripts/agent-task-runner";

const claim = {
  taskId: "task-123",
  post: { id: "post-1", title: "Broken mapping", body: "Account IDs disappear." },
  prompt: "Find the regression.",
  agent: { id: "agent-1", name: "Repo Agent" },
  replies: [],
  repliesTruncated: false,
};

const config: RunnerConfig = {
  baseUrl: "https://example.convex.site/",
  token: "pwc.credential.secret",
  taskId: claim.taskId,
  command: ["agent", "run", "--stdin"],
  timeoutMs: 100,
  maxOutputBytes: 100,
  requestAttempts: 3,
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe("agent task runner", () => {
  test("claims work, passes context on stdin, and submits a successful result", async () => {
    const requests: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = [];
    let commandInput = "";
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return requests.length === 1 ? json(claim) : json({ status: "done", replyId: "reply-1" });
    }) as typeof fetch;

    const result = await runAgentTask(config, {
      fetch: fetchImpl,
      execute: async (command, input) => {
        expect(command).toEqual(["agent", "run", "--stdin"]);
        commandInput = input;
        return {
          exitCode: 0,
          stdout: "The account serializer dropped the ID.\n",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
          timedOut: false,
        };
      },
    });

    const externalRunId = externalRunIdFor(claim.taskId);
    expect(result).toEqual({ status: "done", externalRunId });
    expect(commandInput).toContain("POST: Broken mapping");
    expect(commandInput).toContain("TASK:\nFind the regression.");
    expect(requests.map((request) => request.url)).toEqual([
      "https://example.convex.site/api/connectors/agent-tasks/claim",
      "https://example.convex.site/api/connectors/agent-tasks/result",
    ]);
    expect(requests[0]?.authorization).toBe(`Bearer ${config.token}`);
    expect(requests[0]?.body).toEqual({ taskId: claim.taskId, externalRunId });
    expect(requests[1]?.body).toEqual({
      taskId: claim.taskId,
      externalRunId,
      status: "done",
      body: "The account serializer dropped the ID.",
    });
  });

  test("passes command arguments literally without shell interpolation", async () => {
    const marker = `/tmp/postwork-runner-${crypto.randomUUID()}`;
    const dangerous = `; touch ${marker}`;
    const result = await executeCommand(
      [process.execPath, "-e", "console.log(JSON.stringify(process.argv.slice(1)))", dangerous],
      "ignored",
      { timeoutMs: 1_000, maxOutputBytes: 1_000 },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([dangerous]);
    expect(await Bun.file(marker).exists()).toBe(false);
  });

  test("submits a bounded failure for a nonzero exit", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return bodies.length === 1 ? json(claim) : json({ status: "failed" });
    }) as typeof fetch;

    const result = await runAgentTask(config, {
      fetch: fetchImpl,
      execute: async () => ({
        exitCode: 17,
        stdout: "",
        stderr: "provider command failed",
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false,
      }),
    });

    expect(result.status).toBe("failed");
    expect(bodies[1]).toMatchObject({
      status: "failed",
      error: "Coding-agent command exited with code 17. provider command failed",
    });
  });

  test("kills timed-out commands and bounds captured output", async () => {
    const bounded = await executeCommand(
      [process.execPath, "-e", "process.stdout.write('abcdefghijk')"],
      "",
      { timeoutMs: 1_000, maxOutputBytes: 5 },
    );
    expect(bounded).toMatchObject({ stdout: "abcde", stdoutTruncated: true, timedOut: false });

    const timedOut = await executeCommand(
      [process.execPath, "-e", "await Bun.sleep(500)"],
      "",
      { timeoutMs: 20, maxOutputBytes: 100 },
    );
    expect(timedOut.timedOut).toBe(true);
  });

  test("kills descendants on timeout without waiting for inherited output pipes", async () => {
    const startedAt = performance.now();
    const result = await executeCommand(
      [
        process.execPath,
        "-e",
        [
          `Bun.spawn([process.execPath, "-e", "await Bun.sleep(5000)"],`,
          `{ stdout: "inherit", stderr: "inherit" });`,
        ].join(" "),
      ],
      "",
      { timeoutMs: 30, maxOutputBytes: 100 },
    );
    const elapsedMs = performance.now() - startedAt;

    expect(result.timedOut).toBe(true);
    expect(elapsedMs).toBeLessThan(1_000);
  });

  test("submits a failed result when the executable cannot be launched", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return bodies.length === 1 ? json(claim) : json({ status: "failed" });
    }) as typeof fetch;

    const result = await runAgentTask(config, {
      fetch: fetchImpl,
      execute: async () => {
        throw new Error("ENOENT: executable not found");
      },
    });

    const externalRunId = externalRunIdFor(claim.taskId);
    expect(result).toEqual({ status: "failed", externalRunId });
    expect(bodies[1]).toEqual({
      taskId: claim.taskId,
      externalRunId,
      status: "failed",
      error: "Coding-agent command could not be started. ENOENT: executable not found",
    });
  });

  test("retries result submission with the same stable run identity", async () => {
    const resultBodies: string[] = [];
    let calls = 0;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return json(claim);
      resultBodies.push(String(init?.body));
      if (calls === 2) return json({ error: "temporary" }, 503);
      return json({ status: "done", replyId: "reply-1" });
    }) as typeof fetch;

    await runAgentTask(config, {
      fetch: fetchImpl,
      sleep: async () => {},
      execute: async () => ({
        exitCode: 0,
        stdout: "Stable result",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false,
      }),
    });

    expect(resultBodies).toHaveLength(2);
    expect(resultBodies[0]).toBe(resultBodies[1]);
    expect(JSON.parse(resultBodies[0] ?? "{}").externalRunId).toBe(externalRunIdFor(claim.taskId));
  });

  test("backs off network and server retries and honors Retry-After", async () => {
    const delays: number[] = [];
    const resultBodies: string[] = [];
    let calls = 0;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return json(claim);
      resultBodies.push(String(init?.body));
      if (calls === 2) throw new Error("temporary network failure");
      if (calls === 3) {
        return Response.json(
          { error: "temporarily unavailable" },
          { status: 503, headers: { "retry-after": "2" } },
        );
      }
      return json({ status: "done", replyId: "reply-1" });
    }) as typeof fetch;

    await runAgentTask({ ...config, requestAttempts: 4 }, {
      fetch: fetchImpl,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      execute: async () => ({
        exitCode: 0,
        stdout: "Stable result",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false,
      }),
    });

    expect(delays).toEqual([100, 2_000]);
    expect(resultBodies).toHaveLength(3);
    expect(new Set(resultBodies).size).toBe(1);
  });

  test("rejects malformed reply entries before formatting command input", async () => {
    const malformedReplies: unknown[] = [
      null,
      { id: "reply-1", authorId: "user-1" },
      { id: "reply-1", authorId: "user-1", body: "hello", parentId: 42 },
    ];

    for (const malformedReply of malformedReplies) {
      let executed = false;
      await expect(runAgentTask(config, {
        fetch: (async () => json({ ...claim, replies: [malformedReply] })) as typeof fetch,
        execute: async () => {
          executed = true;
          throw new Error("Malformed claims must not execute commands.");
        },
      })).rejects.toThrow("invalid task claim");
      expect(executed).toBe(false);
    }
  });

  test("rejects output limits above the backend-safe maximum", async () => {
    let calls = 0;
    await expect(runAgentTask({ ...config, maxOutputBytes: 9_501 }, {
      fetch: (async () => {
        calls += 1;
        return json(claim);
      }) as typeof fetch,
      execute: async () => {
        throw new Error("Oversized configuration must fail before execution.");
      },
    })).rejects.toThrow("Maximum output bytes must be at most 9500");
    expect(calls).toBe(0);
  });

  test("does not retry a rejected claim", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return json({ error: "claim_rejected" }, 409);
    }) as typeof fetch;

    await expect(runAgentTask(config, {
      fetch: fetchImpl,
      execute: async () => {
        throw new Error("Command must not run after a rejected claim.");
      },
    })).rejects.toThrow("HTTP 409");
    expect(calls).toBe(1);
  });
});
