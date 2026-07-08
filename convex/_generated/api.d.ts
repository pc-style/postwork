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
import type * as discussions from "../discussions.js";
import type * as flashExperiments from "../flashExperiments.js";
import type * as lib_demo from "../lib/demo.js";
import type * as lib_observability from "../lib/observability.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_validation from "../lib/validation.js";
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
  discussions: typeof discussions;
  flashExperiments: typeof flashExperiments;
  "lib/demo": typeof lib_demo;
  "lib/observability": typeof lib_observability;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/validation": typeof lib_validation;
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
