import { ConvexReactClient } from "convex/react";
import { getRequiredViteEnv } from "./demoMode";

export const convex = new ConvexReactClient(getRequiredViteEnv("VITE_CONVEX_URL"));
