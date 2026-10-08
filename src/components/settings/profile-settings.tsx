"use client";

import { Check, LoaderCircle, Upload, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type ProfileSettingsProps = {
  email: string;
  fullName: string;
  phone: string;
  address: string;
  avatarUrl: string | null;
  avatarError?: string;
};

const maxAvatarSize = 5 * 1024 * 1024;
const supportedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const avatarBucket = "profile-avatars";

export function ProfileSettings({
  email,
  fullName,
  phone,
  address,
  avatarUrl,
  avatarError,
}: ProfileSettingsProps) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [phoneNumber, setPhoneNumber] = useState(phone);
  const [userAddress, setUserAddress] = useState(address);
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [avatarPreviewState, setAvatarPreviewState] = useState({
    source: avatarUrl,
    preview: avatarUrl,
  });
  const avatarPreview =
    avatarPreviewState.source === avatarUrl ? avatarPreviewState.preview : avatarUrl;
  const [message, setMessage] = useState(avatarError ?? "");
  const [isError, setIsError] = useState(Boolean(avatarError));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!avatarPreview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function handleImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!supportedAvatarTypes.has(file.type)) {
      setMessage("Choose a JPEG, PNG, WebP, or GIF image.");
      setIsError(true);
      event.target.value = "";
      return;
    }
    if (file.size > maxAvatarSize) {
      setMessage("Profile pictures must be 5 MB or smaller.");
      setIsError(true);
      event.target.value = "";
      return;
    }

    setSelectedAvatar(file);
    setAvatarPreviewState({ source: avatarUrl, preview: URL.createObjectURL(file) });
    setMessage("");
    setIsError(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setIsError(false);

    const supabase = createClient();
    let uploadedAvatarPath: string | null = null;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Could not verify your account: ${authError.message}`);
      if (!authData.user) throw new Error("Your session has expired. Sign in again to save your profile.");

      const currentAvatarPath =
        typeof authData.user.user_metadata.avatar_path === "string"
          ? authData.user.user_metadata.avatar_path
          : null;
      let nextAvatarPath = currentAvatarPath;
      const previousAvatarPath = currentAvatarPath;

      if (selectedAvatar) {
        const extension = selectedAvatar.type.split("/")[1].replace("jpeg", "jpg");
        uploadedAvatarPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(avatarBucket)
          .upload(uploadedAvatarPath, selectedAvatar, {
            cacheControl: "3600",
            contentType: selectedAvatar.type,
            upsert: true,
          });
        if (uploadError) {
          throw new Error(`Could not upload your profile picture: ${uploadError.message}`);
        }
        nextAvatarPath = uploadedAvatarPath;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          phone: phoneNumber.trim(),
          address: userAddress.trim(),
          avatar_path: nextAvatarPath,
        },
      });

      if (updateError) {
        if (uploadedAvatarPath) {
          const { error: cleanupError } = await supabase.storage
            .from(avatarBucket)
            .remove([uploadedAvatarPath]);
          if (cleanupError) {
            throw new Error(
              `Profile details were not saved (${updateError.message}); uploaded image cleanup also failed (${cleanupError.message}).`,
            );
          }
        }
        throw new Error(`Could not save your profile: ${updateError.message}`);
      }

      let cleanupWarning = "";
      if (selectedAvatar && previousAvatarPath && previousAvatarPath !== uploadedAvatarPath) {
        const { error: cleanupError } = await supabase.storage
          .from(avatarBucket)
          .remove([previousAvatarPath]);
        if (cleanupError) {
          cleanupWarning = `Profile saved, but the previous picture could not be removed: ${cleanupError.message}`;
        }
      }

      setMessage(cleanupWarning || "Your profile has been saved.");
      setIsError(Boolean(cleanupWarning));
      setSelectedAvatar(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your profile.");
      setIsError(true);
    } finally {
      setIsSaving(false);
    }
  }

  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal details and profile picture.
        </p>
      </div>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-semibold text-primary ring-1 ring-border">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Profile picture" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Profile picture</p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG, PNG, WebP, or GIF; up to 5 MB.
            </p>
            <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Select image
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="sr-only"
                aria-label="Upload profile picture"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Email
            <input
              type="email"
              value={email}
              readOnly
              className="h-10 rounded-lg border border-input bg-muted px-3 text-sm font-normal text-muted-foreground"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Full name
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Your full name"
              maxLength={200}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Phone number
            <input
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="+44 0000 000000"
              maxLength={40}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Address
            <textarea
              autoComplete="street-address"
              value={userAddress}
              onChange={(event) => setUserAddress(event.target.value)}
              rows={3}
              className="resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Street, city, postal code"
              maxLength={1000}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {message ? (
            <p
              role={isError ? "alert" : "status"}
              className={`inline-flex items-center gap-1.5 text-xs ${isError ? "text-danger" : "text-success"}`}
            >
              {isError ? null : <Check className="h-3.5 w-3.5" />}
              {message}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              Profile changes are saved to your account.
            </p>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </section>
  );
}
