import { useEffect } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { getFlashExperiment } from "../flashExperiments/registry";
import { useActiveExperiment } from "../flashExperiments/active";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { FeedPage } from "./FeedPage";

const routeApi = getRouteApi("/app/flash-experiments/$slug");

/**
 * Entering an experiment activates it (so the override applies app-wide) and
 * drops you on the real feed as the starting surface. From here every
 * interaction is the real app with the single experimental change patched in.
 * The floating exit control lives in RootLayout while an experiment is active.
 */
export function FlashExperimentPage() {
  const { slug } = routeApi.useParams();
  const { setSlug } = useActiveExperiment();
  const experiment = getFlashExperiment(slug);

  useDocumentTitle(
    experiment ? `${experiment.title} · postwork` : "flash experiments · postwork",
  );

  useEffect(() => {
    setSlug(slug);
  }, [slug, setSlug]);

  if (!experiment) {
    return (
      <div className="rounded-lg border border-dashed border-accent/40 bg-surface p-5 font-mono">
        <h1 className="text-lg font-semibold text-fg">experiment not found</h1>
        <Link
          to="/flash-experiments"
          className="mt-3 inline-block text-sm text-accent-soft"
        >
          ← back to experiments
        </Link>
      </div>
    );
  }

  return <FeedPage />;
}
