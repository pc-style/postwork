import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

type AvatarAction =
  | { type: "upload"; storageId: Id<"_storage"> }
  | { type: "remove" }
  | { type: "useProvider" }
  | undefined;

type AvatarDraft = "unchanged" | "upload" | "remove" | "provider";

export function ProfileDialog(props: {
  mode: "onboarding" | "edit";
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  if (!props.open) return null;

  if (props.mode === "onboarding") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 py-10 backdrop-blur-sm">
        <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-6 text-fg shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.45),0_24px_64px_rgba(0,0,0,0.55)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-fg [text-wrap:balance]">
              finish your profile
            </h2>
          </div>
          <ProfileDialogBody mode={props.mode} onClose={props.onClose} />
        </div>
      </div>
    );
  }

  return (
    <Dialog title="edit profile" onClose={props.onClose}>
      <ProfileDialogBody mode={props.mode} onClose={props.onClose} />
    </Dialog>
  );
}

function ProfileDialogBody({
  mode,
  onClose,
}: {
  mode: "onboarding" | "edit";
  onClose: () => void;
}) {
  const me = useQuery(api.users.me, {});
  const completeProfile = useMutation(api.users.completeProfile);
  const updateProfile = useMutation(api.users.updateProfile);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);

  const user = me?.user ?? null;
  const initialName = user?.name ?? "";
  const initialInitials = user?.initials ?? deriveInitials(initialName);
  // Preserve an existing (grandfathered) job title through the onboarding
  // modal; "member" is the placeholder default, so treat it as empty.
  const initialTitle = user?.title && user.title !== "member" ? user.title : "";
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState(initialTitle);
  const [initials, setInitials] = useState(initialInitials);
  const [initialsOverridden, setInitialsOverridden] = useState(false);
  const [avatarAction, setAvatarAction] = useState<AvatarAction>();
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft>("unchanged");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(initialName);
    setInitials(initialInitials);
    setTitle(initialTitle);
    setInitialsOverridden(false);
  }, [initialInitials, initialName, initialTitle]);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const effectivePreview = useMemo(() => {
    if (avatarDraft === "upload") return localPreview;
    if (avatarDraft === "provider") return user?.providerAvatarUrl ?? null;
    if (avatarDraft === "remove") return null;
    return user?.avatarUrl ?? null;
  }, [avatarDraft, localPreview, user?.avatarUrl, user?.providerAvatarUrl]);

  const showingProvider =
    !!user?.providerAvatarUrl && effectivePreview === user.providerAvatarUrl;

  const onNameChange = (nextName: string) => {
    setName(nextName);
    if (!initialsOverridden) setInitials(deriveInitials(nextName));
  };

  const onInitialsChange = (nextInitials: string) => {
    setInitialsOverridden(true);
    setInitials(normalizeInitials(nextInitials));
  };

  const onFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("image must be under 5 MB");
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrl = await generateAvatarUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("upload failed");
      const json: unknown = await response.json();
      if (!isStorageUploadResponse(json)) throw new Error("upload failed");
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
      setAvatarAction({ type: "upload", storageId: json.storageId });
      setAvatarDraft("upload");
    } catch {
      setError("couldn't upload that image. try another one.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = async () => {
    const trimmedName = name.trim();
    const normalizedInitials = normalizeInitials(initials || trimmedName);
    if (!trimmedName || !normalizedInitials) return;
    setIsSaving(true);
    setError(null);
    try {
      if (mode === "onboarding") {
        await completeProfile({
          name: trimmedName,
          title: title.trim(),
          initials: normalizedInitials,
          avatar: avatarAction,
        });
      } else {
        await updateProfile({
          name: trimmedName,
          initials: normalizedInitials,
          avatar: avatarAction,
        });
        onClose();
      }
    } catch {
      setError("couldn't save your profile. try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-fg"
          style={{
            backgroundColor: effectivePreview
              ? undefined
              : (user?.avatarColor ?? "#3a2526"),
            fontSize: 72 * 0.38,
          }}
          title={name || user?.name}
        >
          {effectivePreview ? (
            <img
              src={effectivePreview}
              alt="profile preview"
              className="h-full w-full object-cover"
            />
          ) : (
            initials || initialInitials
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void onFileChange(event.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSaving}
            >
              {isUploading ? "uploading…" : "upload image"}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setAvatarAction({ type: "remove" });
                setAvatarDraft("remove");
              }}
              disabled={isUploading || isSaving}
            >
              remove
            </Button>
            {user?.providerAvatarUrl && !showingProvider && (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setAvatarAction({ type: "useProvider" });
                  setAvatarDraft("provider");
                }}
                disabled={isUploading || isSaving}
              >
                use login photo
              </Button>
            )}
          </div>
          <p className="text-xs leading-5 text-faint">
            upload a square-ish image, or keep initials.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-label font-medium lowercase text-muted">
          name
        </span>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-label font-medium lowercase text-muted">
          initials
        </span>
        <input
          value={initials}
          maxLength={2}
          onChange={(event) => onInitialsChange(event.target.value)}
          className="w-24 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent/50"
        />
      </label>

      {mode === "onboarding" && (
        <label className="block">
          <span className="mb-1.5 block text-label font-medium lowercase text-muted">
            job title
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
          <span className="mt-1.5 block text-xs leading-5 text-faint">
            what you do, not what you can do — admins manage permissions
          </span>
        </label>
      )}

      {error && <p className="text-xs leading-5 text-urgent">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {mode === "edit" && (
          <Button variant="quiet" onClick={onClose} disabled={isSaving}>
            cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!name.trim() || isSaving || isUploading}
        >
          {isSaving ? "saving…" : "save profile"}
        </Button>
      </div>
    </form>
  );
}

function deriveInitials(name: string): string {
  return normalizeInitials(name);
}

function normalizeInitials(value: string): string {
  return value.replace(/\s+/g, "").slice(0, 2).toUpperCase();
}

function isStorageUploadResponse(
  value: unknown,
): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof value.storageId === "string"
  );
}
