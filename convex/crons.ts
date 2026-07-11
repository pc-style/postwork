import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// One-shot cleanup is scheduled per ticket. This interval is a bounded
// backstop for delayed schedules and tickets created by older deployments.
crons.interval(
  "clean expired attachment upload tickets",
  { minutes: 15 },
  internal.attachments.cleanupExpiredUploadTickets,
  {},
);

export default crons;
