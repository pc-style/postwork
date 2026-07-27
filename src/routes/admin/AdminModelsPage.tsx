import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { timeAgo } from "../../lib/format";
import { AdminPage, StatusPill } from "./AdminShell";

type SettingsPayload = FunctionReturnType<typeof api.admin.aiModelSettings>;
type ModelSetting = SettingsPayload["settings"][number];
type GenerationKind = ModelSetting["kind"];
type FreeModel = { id: string; name: string; contextLength?: number };

const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_FREE_MODEL: FreeModel = {
  id: "openrouter/free",
  name: "OpenRouter free router",
};

const GENERATION_META: Record<
  GenerationKind,
  { label: string; description: string }
> = {
  postSummary: {
    label: "post summaries",
    description:
      "Generate or regenerate the catch-up summary shown at the top of a post thread.",
  },
  agentTask: {
    label: "agent task replies",
    description:
      "Generate the simulated coding-agent investigation result that gets posted back into a thread.",
  },
};

export function AdminModelsPage() {
  const settings = useQuery(api.admin.aiModelSettings);
  const loadFreeModels = useAction(api.ai.listOpenRouterFreeModels);
  const [fetchedModels, setFetchedModels] = useState<FreeModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setModelsLoading(true);
    void loadFreeModels({})
      .then((models) => {
        if (!mounted) return;
        setFetchedModels(models);
        setModelsError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setModelsError(
          err instanceof Error
            ? err.message
            : "Could not load OpenRouter's free model list.",
        );
      })
      .finally(() => {
        if (mounted) setModelsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadFreeModels]);

  const freeModels = useMemo(() => {
    const byId = new Map<string, FreeModel>();
    byId.set(DEFAULT_FREE_MODEL.id, DEFAULT_FREE_MODEL);
    for (const model of fetchedModels) byId.set(model.id, model);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [fetchedModels]);

  return (
    <AdminPage
      title="models"
      description="choose an OpenRouter model per generation path. presets show free models only; custom model ids are allowed."
    >
      {settings === undefined ? (
        <Skeleton preset="stats" count={2} label="Loading model settings" />
      ) : (
        <div className="grid gap-4">
          {!settings.openRouterConfigured ? (
            <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-4 text-sm leading-6 text-muted">
              <div className="font-medium text-accent-soft">OpenRouter key missing</div>
              <p className="mt-1">
                Model choices are saved here, but generation needs
                {" "}
                <code className="font-mono text-xs text-fg">OPENROUTER_API_KEY</code>
                {" "}
                in the Convex environment before these OpenRouter settings can run.
              </p>
            </div>
          ) : null}

          {modelsError ? (
            <div role="alert" className="rounded-lg border border-urgent/30 bg-urgent/5 p-4 text-sm text-urgent">
              {modelsError} You can still enter a custom model id.
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {settings.settings.map((setting) => (
              <ModelSettingCard
                key={setting.kind}
                setting={setting}
                freeModels={freeModels}
                modelsLoading={modelsLoading}
              />
            ))}
          </div>
        </div>
      )}
    </AdminPage>
  );
}

function ModelSettingCard({
  setting,
  freeModels,
  modelsLoading,
}: {
  setting: ModelSetting;
  freeModels: FreeModel[];
  modelsLoading: boolean;
}) {
  const setModel = useMutation(api.admin.setAiModelSetting);
  const resetModel = useMutation(api.admin.resetAiModelSetting);
  const [draft, setDraft] = useState(setting.effectiveModelId);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = GENERATION_META[setting.kind];

  useEffect(() => {
    const nextModelId = setting.modelId ?? setting.effectiveModelId;
    setDraft(nextModelId);
    setMode(freeModels.some((model) => model.id === nextModelId) ? "preset" : "custom");
    setError(null);
  }, [setting.kind, setting.modelId, setting.effectiveModelId, freeModels]);

  const selectedValue = mode === "custom" ? CUSTOM_MODEL_VALUE : draft;
  const canReset = setting.modelId !== null;

  async function save() {
    const modelId = draft.trim();
    if (!modelId) {
      setError("Model ID is required.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      await setModel({ kind: setting.kind, modelId });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save this model setting.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    try {
      await resetModel({ kind: setting.kind });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reset this model setting.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-fg">{meta.label}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{meta.description}</p>
        </div>
        <StatusPill tone={setting.modelId ? "good" : "muted"}>
          {setting.modelId ? "pinned" : "env"}
        </StatusPill>
      </div>

      <dl className="mt-4 grid gap-2 rounded-md border border-border bg-bg px-3 py-2 text-xs">
        <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-muted">effective model</dt>
          <dd className="break-all font-mono text-fg">{setting.effectiveModelId}</dd>
        </div>
        {setting.updatedAt ? (
          <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-muted">updated</dt>
            <dd className="text-fg">
              {timeAgo(setting.updatedAt)} by {setting.updatedByName ?? "unknown"}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="text-label font-medium lowercase text-muted">
            free model preset
          </span>
          <select
            value={selectedValue}
            onChange={(event) => {
              const next = event.target.value;
              if (next === CUSTOM_MODEL_VALUE) {
                setMode("custom");
                if (!draft.trim() || freeModels.some((model) => model.id === draft)) {
                  setDraft("");
                }
              } else {
                setMode("preset");
                setDraft(next);
              }
            }}
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg transition-colors focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
          >
            {freeModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} — {model.id}
                {model.contextLength
                  ? ` (${formatContextLength(model.contextLength)})`
                  : ""}
              </option>
            ))}
            <option value={CUSTOM_MODEL_VALUE}>custom model id…</option>
          </select>
        </label>

        {mode === "custom" ? (
          <label className="block">
            <span className="text-label font-medium lowercase text-muted">
              custom model id
            </span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="provider/model:free"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg transition-colors placeholder:text-muted/60 focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
            />
            <p className="mt-1.5 text-xs leading-5 text-muted">
              Use this for a newly released free model, an OpenRouter alias, or a
              router id that is not in the fetched list.
            </p>
          </label>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-3 text-xs text-urgent">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {modelsLoading ? "loading free OpenRouter models…" : `${freeModels.length} free presets`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="quiet"
            size="sm"
            disabled={!canReset || busy !== null}
            loading={busy === "reset"}
            loadingLabel="resetting…"
            onClick={() => void reset()}
          >
            use env default
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!draft.trim() || busy !== null}
            loading={busy === "save"}
            loadingLabel="saving…"
            onClick={() => void save()}
          >
            save model
          </Button>
        </div>
      </div>
    </article>
  );
}

function formatContextLength(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}
