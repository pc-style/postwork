import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { FormField } from "./FormField";

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

  return (
    <Dialog
      title={props.mode === "onboarding" ? "Finish your profile" : "Edit profile"}
      description={
        props.mode === "onboarding"
          ? "Add the details teammates will see across Postwork."
          : "Update your name, initials, or profile image."
      }
      dismissible={props.mode === "edit"}
      onClose={props.onClose}
    >
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
    setError(null);
    if (!initialsOverridden) setInitials(deriveInitials(nextName));
  };

  const onInitialsChange = (nextInitials: string) => {
    setInitialsOverridden(true);
    setInitials(normalizeInitials(nextInitials));
    setError(null);
  };

  const onFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
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
      if (!response.ok) throw new Error("Upload failed");
      const json: unknown = await response.json();
      if (!isStorageUploadResponse(json)) throw new Error("Upload failed");
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
      setAvatarAction({ type: "upload", storageId: json.storageId });
      setAvatarDraft("upload");
    } catch {
      setError("We couldn't upload that image. Choose another image and try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = async () => {
    const trimmedName = name.trim();
    const normalizedInitials = normalizeInitials(initials || trimmedName);
    if (!trimmedName || !normalizedInitials || isSaving) return;
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
      setError("We couldn't save your profile. Review the fields and try again.");
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-fg"
          style={{
            backgroundColor: effectivePreview ? undefined : user?.avatarColor ?? "#3a2526",
            fontSize: 72 * 0.38,
          }}
          aria-label="Profile image preview"
        >
          {effectivePreview ? (
            <img src={effectivePreview} alt="Profile preview" className="size-full object-cover" />
          ) : (
            initials || initialInitials
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Choose a profile image"
            className="hidden"
            onChange={(event) => void onFileChange(event.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              loading={isUploading}
              loadingLabel="uploading…"
            >
              upload image
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
            {user?.providerAvatarUrl && !showingProvider ? (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setAvatarAction({ type: "useProvider" });
                  setAvatarDraft("provider");
                }}
                disabled={isUploading || isSaving}
              >
                use sign-in photo
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-muted">Use a square image, or keep your initials.</p>
        </div>
      </div>

      <FormField label="Name" required>
        <input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} className="ui-field" />
      </FormField>

      <FormField label="Initials" required help="Use up to two letters.">
        <input
          value={initials}
          maxLength={2}
          onChange={(event) => onInitialsChange(event.target.value)}
          className="ui-field max-w-28 font-mono"
        />
      </FormField>

      {mode === "onboarding" ? (
        <FormField label="Job title" optional help="Describe your work. Admins manage permissions separately.">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="ui-field" />
        </FormField>
      ) : null}

      {error ? <p role="alert" className="ui-error">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        {mode === "edit" ? (
          <Button variant="secondary" onClick={onClose} disabled={isSaving} className="w-full sm:w-auto">
            cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={!name.trim() || isUploading}
          loading={isSaving}
          loadingLabel="saving…"
          className="w-full sm:w-auto"
        >
          save profile
        </Button>
      </div>
    </form>
  );
}

function deriveInitials(name: string) {
  return normalizeInitials(name);
}

function normalizeInitials(value: string) {
  return value.replace(/\s+/g, "").slice(0, 2).toUpperCase();
}

function isStorageUploadResponse(value: unknown): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof value.storageId === "string"
  );
}
