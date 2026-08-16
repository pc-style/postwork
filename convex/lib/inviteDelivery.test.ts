import { describe, expect, test } from "vitest";
import { inviteJoinUrl, renderInviteEmail } from "../inviteDelivery";

describe("inviteJoinUrl", () => {
  test("builds the join link on the configured origin", () => {
    expect(inviteJoinUrl("https://postwork.example", "abc-123")).toBe(
      "https://postwork.example/join/abc-123",
    );
  });

  test("rejects unsafe or decorated app urls", () => {
    expect(inviteJoinUrl("javascript:alert(1)", "abc")).toBeNull();
    expect(inviteJoinUrl("https://user:pass@postwork.example", "abc")).toBeNull();
    expect(inviteJoinUrl("https://postwork.example?tracking=1", "abc")).toBeNull();
    expect(inviteJoinUrl("not a url", "abc")).toBeNull();
  });

  test("url-encodes the code", () => {
    expect(inviteJoinUrl("https://postwork.example", "a b/c")).toBe(
      "https://postwork.example/join/a%20b%2Fc",
    );
  });
});

describe("renderInviteEmail", () => {
  test("escapes the org name and includes the join link in html and text", () => {
    const content = renderInviteEmail({
      orgName: "Acme <script>alert(1)</script>",
      joinUrl: "https://postwork.example/join/abc",
    });
    expect(content.subject).toContain("Acme <script>");
    expect(content.html).toContain("Acme &lt;script&gt;");
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain('href="https://postwork.example/join/abc"');
    expect(content.text).toContain("Accept the invite: https://postwork.example/join/abc");
  });
});
