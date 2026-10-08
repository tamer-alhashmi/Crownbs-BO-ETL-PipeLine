INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own profile avatars" ON storage.objects;
CREATE POLICY "Users can read own profile avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

DROP POLICY IF EXISTS "Users can upload own profile avatars" ON storage.objects;
CREATE POLICY "Users can upload own profile avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

DROP POLICY IF EXISTS "Users can update own profile avatars" ON storage.objects;
CREATE POLICY "Users can update own profile avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

DROP POLICY IF EXISTS "Users can delete own profile avatars" ON storage.objects;
CREATE POLICY "Users can delete own profile avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
