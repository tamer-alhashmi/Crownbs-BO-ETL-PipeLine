import type { SupabaseClient, User } from "@supabase/supabase-js";

const avatarBucket = "profile-avatars";

export async function getProfileAvatarUrl(
  supabase: SupabaseClient,
  user: User,
): Promise<{ url: string | null; error?: string }> {
  const path = user.user_metadata.avatar_path;
  if (typeof path !== "string" || !path) return { url: null };
  if (!path.startsWith(`${user.id}/`)) {
    return { url: null, error: "The saved profile picture path is invalid." };
  }

  const { data, error } = await supabase.storage
    .from(avatarBucket)
    .createSignedUrl(path, 60 * 60);
  if (error) return { url: null, error: error.message };
  return { url: data.signedUrl };
}
