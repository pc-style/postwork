import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./Button";
import { FormField } from "./FormField";

type AvatarAction =
  | { type: "upload"; storageId: Id<"_storage"> }
  | { type: "remove" }
  | { type: "useProvider" }
  | undefined;
type AvatarDraft = "unchanged" | "upload" | "remove" | "provider";

export function ProfileSettingsForm() {
  const me = useQuery(api.users.me, {});
  const updateProfile = useMutation(api.users.updateProfile);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const user = me?.user ?? null;
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [initials, setInitials] = useState("");
  const [initialsOverridden, setInitialsOverridden] = useState(false);
  const [avatarAction, setAvatarAction] = useState<AvatarAction>();
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft>("unchanged");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setTitle(user.title === "member" ? "" : user.title);
    setInitials(user.initials);
  }, [user]);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const preview = useMemo(() => {
    if (avatarDraft === "upload") return localPreview;
    if (avatarDraft === "provider") return user?.providerAvatarUrl ?? null;
    if (avatarDraft === "remove") return null;
    return user?.avatarUrl ?? null;
  }, [avatarDraft, localPreview, user]);

  const changeName = (next: string) => {
    setName(next);
    setSaved(false);
    if (!initialsOverridden) setInitials(deriveInitials(next));
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("choose an image smaller than 5 MB.");
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const uploadUrl = await generateAvatarUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("upload failed");
      const body: unknown = await response.json();
      if (!isUploadResponse(body)) throw new Error("upload failed");
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
      setAvatarAction({ type: "upload", storageId: body.storageId });
      setAvatarDraft("upload");
    } catch {
      setError("we couldn't upload that image. choose another image and try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = async () => {
    const normalizedInitials = normalizeInitials(initials || name);
    if (!name.trim() || !normalizedInitials) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        name: name.trim(),
        title: title.trim(),
        initials: normalizedInitials,
        avatar: avatarAction,
      });
      setAvatarAction(undefined);
      setAvatarDraft("unchanged");
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught, "we couldn't save your profile. review the fields and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return <p className="text-sm text-muted">loading profile…</p>;

  return (
    <form className="max-w-xl space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-fg" style={{ backgroundColor: preview ? undefined : user.avatarColor, fontSize: 27 }}>
          {preview ? <img src={preview} alt="profile preview" className="size-full object-cover" /> : initials}
        </div>
        <div className="space-y-2">
          <input ref={fileInputRef} type="file" accept="image/*" aria-label="choose a profile image" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} loading={isUploading} loadingLabel="uploading…">upload image</Button>
            <Button variant="quiet" size="sm" onClick={() => { setAvatarAction({ type: "remove" }); setAvatarDraft("remove"); }}>remove</Button>
            {user.providerAvatarUrl && preview !== user.providerAvatarUrl ? (
              <Button variant="quiet" size="sm" onClick={() => { setAvatarAction({ type: "useProvider" }); setAvatarDraft("provider"); }}>use sign-in photo</Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">use a square image, or keep your initials.</p>
        </div>
      </div>
      <FormField label="name" required><input value={name} onChange={(event) => changeName(event.target.value)} className="ui-field" /></FormField>
      <FormField label="job title" optional><input value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} className="ui-field" /></FormField>
      <FormField label="initials" required help="use up to two letters."><input value={initials} maxLength={2} onChange={(event) => { setInitialsOverridden(true); setInitials(normalizeInitials(event.target.value)); setSaved(false); }} className="ui-field max-w-28" /></FormField>
      {error ? <p role="alert" className="ui-error">{error}</p> : null}
      {saved ? <p role="status" className="text-xs text-accent-soft">profile saved.</p> : null}
      <Button type="submit" disabled={!name.trim() || isUploading} loading={isSaving} loadingLabel="saving…">save profile</Button>
    </form>
  );
}

function deriveInitials(name: string) {
  return normalizeInitials(name.split(/\s+/).filter(Boolean).map((part) => part[0]).join(""));
}

function normalizeInitials(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}

function isUploadResponse(value: unknown): value is { storageId: Id<"_storage"> } {
  return typeof value === "object" && value !== null && "storageId" in value && typeof value.storageId === "string";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    return data.message?.toLowerCase() ?? fallback;
  }
  return fallback;
}
