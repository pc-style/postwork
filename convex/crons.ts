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

// X → Postwork cross-posting. A no-op until X_SYNC_HANDLE and
// X_SYNC_CONNECTOR_ID are set on the deployment.
crons.interval(
  "mirror new x posts into postwork",
  { minutes: 30 },
  internal.xSync.run,
  {},
);

export default crons;
