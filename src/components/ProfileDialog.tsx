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

type NotificationDraft = {
  outboundEnabled: boolean;
  immediateUrgentEnabled: boolean;
  digestEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimeZone: string;
};

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
          : "Update your profile and notification preferences."
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
  const notificationPreferences = useQuery(
    api.notificationPreferences.current,
    mode === "edit" ? {} : "skip",
  );
  const updateNotificationPreferences = useMutation(
    api.notificationPreferences.update,
  );

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
  const [notificationDraft, setNotificationDraft] =
    useState<NotificationDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(initialName);
    setInitials(initialInitials);
    setTitle(initialTitle);
    setInitialsOverridden(false);
  }, [initialInitials, initialName, initialTitle]);

  useEffect(() => {
    if (mode !== "edit" || !notificationPreferences || notificationDraft) return;
    const browserTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setNotificationDraft({
      outboundEnabled: notificationPreferences.outboundEnabled,
      immediateUrgentEnabled: notificationPreferences.immediateUrgentEnabled,
      digestEnabled: notificationPreferences.digestEnabled,
      quietHoursEnabled: notificationPreferences.quietHoursEnabled,
      quietHoursStart: notificationPreferences.quietHoursStart,
      quietHoursEnd: notificationPreferences.quietHoursEnd,
      quietHoursTimeZone: notificationPreferences.isDefault
        ? browserTimeZone
        : notificationPreferences.quietHoursTimeZone,
    });
  }, [mode, notificationDraft, notificationPreferences]);

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
    if (
      mode === "edit" &&
      notificationDraft?.quietHoursEnabled &&
      notificationDraft.quietHoursStart === notificationDraft.quietHoursEnd
    ) {
      setError("Choose different start and end times for quiet hours.");
      return;
    }
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
        if (!notificationDraft) {
          throw new Error("Notification preferences are still loading.");
        }
        await updateNotificationPreferences(notificationDraft);
        await updateProfile({
          name: trimmedName,
          initials: normalizedInitials,
          avatar: avatarAction,
        });
        onClose();
      }
    } catch {
      setError("We couldn't save your settings. Review the fields and try again.");
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

      {mode === "edit" ? (
        <fieldset
          className="space-y-3 border-t border-border pt-4"
          disabled={!notificationDraft || isSaving}
        >
          <legend className="text-sm font-medium text-fg">notifications</legend>
          <p className="text-xs leading-5 text-muted">
            In-app unread state always stays on. Outbound delivery is off by default.
          </p>

          {notificationDraft ? (
            <>
              <PreferenceCheckbox
                checked={notificationDraft.outboundEnabled}
                onChange={(outboundEnabled) =>
                  setNotificationDraft((draft) =>
                    draft ? { ...draft, outboundEnabled } : draft,
                  )
                }
                label="outbound notifications"
                help="Allow notifications outside the app when a delivery provider is connected."
              />

              <div
                className={`space-y-3 border-l border-border pl-4 ${
                  notificationDraft.outboundEnabled ? "" : "opacity-60"
                }`}
              >
                <PreferenceCheckbox
                  checked={notificationDraft.immediateUrgentEnabled}
                  onChange={(immediateUrgentEnabled) =>
                    setNotificationDraft((draft) =>
                      draft ? { ...draft, immediateUrgentEnabled } : draft,
                    )
                  }
                  disabled={!notificationDraft.outboundEnabled}
                  label="send urgent posts immediately"
                  help="Only urgent unread posts qualify; high and normal never interrupt."
                />
                <PreferenceCheckbox
                  checked={notificationDraft.digestEnabled}
                  onChange={(digestEnabled) =>
                    setNotificationDraft((draft) =>
                      draft ? { ...draft, digestEnabled } : draft,
                    )
                  }
                  disabled={!notificationDraft.outboundEnabled}
                  label="include a digest"
                  help="Bundle high and normal posts, plus urgent posts held back by your settings."
                />
                <PreferenceCheckbox
                  checked={notificationDraft.quietHoursEnabled}
                  onChange={(quietHoursEnabled) =>
                    setNotificationDraft((draft) =>
                      draft ? { ...draft, quietHoursEnabled } : draft,
                    )
                  }
                  disabled={!notificationDraft.outboundEnabled}
                  label="quiet hours"
                  help="Never send an immediate notification during this window."
                />

                {notificationDraft.quietHoursEnabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Starts">
                      <input
                        type="time"
                        value={notificationDraft.quietHoursStart}
                        onChange={(event) =>
                          setNotificationDraft((draft) =>
                            draft
                              ? { ...draft, quietHoursStart: event.target.value }
                              : draft,
                          )
                        }
                        disabled={!notificationDraft.outboundEnabled}
                        className="ui-field"
                      />
                    </FormField>
                    <FormField label="Ends">
                      <input
                        type="time"
                        value={notificationDraft.quietHoursEnd}
                        onChange={(event) =>
                          setNotificationDraft((draft) =>
                            draft
                              ? { ...draft, quietHoursEnd: event.target.value }
                              : draft,
                          )
                        }
                        disabled={!notificationDraft.outboundEnabled}
                        className="ui-field"
                      />
                    </FormField>
                    <p className="col-span-2 text-xs leading-5 text-muted">
                      Times use {notificationDraft.quietHoursTimeZone}.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted">loading notification preferences…</p>
          )}
        </fieldset>
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
          disabled={
            !name.trim() ||
            isUploading ||
            (mode === "edit" && !notificationDraft)
          }
          loading={isSaving}
          loadingLabel="saving…"
          className="w-full sm:w-auto"
        >
          {mode === "edit" ? "save settings" : "save profile"}
        </Button>
      </div>
    </form>
  );
}

function PreferenceCheckbox({
  checked,
  onChange,
  label,
  help,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  help: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-fg has-disabled:cursor-not-allowed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{help}</span>
      </span>
    </label>
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
