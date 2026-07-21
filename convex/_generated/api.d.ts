/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as agentTasks from "../agentTasks.js";
import type * as ai from "../ai.js";
import type * as attachments from "../attachments.js";
import type * as authUsers from "../authUsers.js";
import type * as avatarPalette from "../avatarPalette.js";
import type * as catchUpComposer from "../catchUpComposer.js";
import type * as connectors from "../connectors.js";
import type * as crons from "../crons.js";
import type * as discussions from "../discussions.js";
import type * as flashExperiments from "../flashExperiments.js";
import type * as http from "../http.js";
import type * as lib_aiModels from "../lib/aiModels.js";
import type * as lib_attachmentStorage from "../lib/attachmentStorage.js";
import type * as lib_connectorSecrets from "../lib/connectorSecrets.js";
import type * as lib_githubWebhooks from "../lib/githubWebhooks.js";
import type * as lib_inviteTargets from "../lib/inviteTargets.js";
import type * as lib_mediaPolicy from "../lib/mediaPolicy.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_summaryStaleness from "../lib/summaryStaleness.js";
import type * as lib_validation from "../lib/validation.js";
import type * as migrations from "../migrations.js";
import type * as notificationComposer from "../notificationComposer.js";
import type * as notificationDelivery from "../notificationDelivery.js";
import type * as notificationPreferences from "../notificationPreferences.js";
import type * as orgs from "../orgs.js";
import type * as posts from "../posts.js";
import type * as replies from "../replies.js";
import type * as seed from "../seed.js";
import type * as spaces from "../spaces.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  agentTasks: typeof agentTasks;
  ai: typeof ai;
  attachments: typeof attachments;
  authUsers: typeof authUsers;
  avatarPalette: typeof avatarPalette;
  catchUpComposer: typeof catchUpComposer;
  connectors: typeof connectors;
  crons: typeof crons;
  discussions: typeof discussions;
  flashExperiments: typeof flashExperiments;
  http: typeof http;
  "lib/aiModels": typeof lib_aiModels;
  "lib/attachmentStorage": typeof lib_attachmentStorage;
  "lib/connectorSecrets": typeof lib_connectorSecrets;
  "lib/githubWebhooks": typeof lib_githubWebhooks;
  "lib/inviteTargets": typeof lib_inviteTargets;
  "lib/mediaPolicy": typeof lib_mediaPolicy;
  "lib/observability": typeof lib_observability;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/summaryStaleness": typeof lib_summaryStaleness;
  "lib/validation": typeof lib_validation;
  migrations: typeof migrations;
  notificationComposer: typeof notificationComposer;
  notificationDelivery: typeof notificationDelivery;
  notificationPreferences: typeof notificationPreferences;
  orgs: typeof orgs;
  posts: typeof posts;
  replies: typeof replies;
  seed: typeof seed;
  spaces: typeof spaces;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
