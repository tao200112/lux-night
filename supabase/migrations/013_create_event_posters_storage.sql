-- =========================================================
-- 013 CREATE EVENT POSTERS STORAGE
-- 创建活动海报存储桶和权限策略
-- =========================================================
-- 说明：
-- - 创建 event-posters bucket（如果不存在）
-- - 配置 Storage RLS policies
-- - 上传：仅 admin 和 merchant owner 可写
-- - 读取：public（通过 signed URL 或 public URL）
-- =========================================================

-- 1. 创建 Storage Bucket（如果不存在）
-- 注意：Supabase Storage buckets 需要通过 SQL 或 Dashboard 创建
-- 这里使用 SQL 函数创建（如果支持）

-- 检查并创建 bucket（使用 Supabase Storage API）
-- 由于 Supabase 的 bucket 创建需要通过 Dashboard 或 API，这里提供 SQL 注释说明
-- 实际创建需要通过 Supabase Dashboard: Storage → Create Bucket
-- 或使用 Supabase CLI: supabase storage create event-posters --public false

-- 2. 创建 Storage Policies（RLS）

-- 2.1 允许 admin 上传和读取
DROP POLICY IF EXISTS "Admin can upload event posters" ON storage.objects;
CREATE POLICY "Admin can upload event posters"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-posters' AND
  (
    -- 检查是否是 admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

DROP POLICY IF EXISTS "Admin can read event posters" ON storage.objects;
CREATE POLICY "Admin can read event posters"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'event-posters' AND
  (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

DROP POLICY IF EXISTS "Admin can delete event posters" ON storage.objects;
CREATE POLICY "Admin can delete event posters"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-posters' AND
  (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

-- 2.2 允许 merchant owner 上传和读取（仅限自己商户的文件）
DROP POLICY IF EXISTS "Merchant owners can upload event posters" ON storage.objects;
CREATE POLICY "Merchant owners can upload event posters"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-posters' AND
  (
    -- 路径格式：merchants/{merchant_id}/events/{event_id}/{filename}
    -- 检查用户是否是路径中 merchant_id 的 owner
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid()
        AND mm.role = 'OWNER'
        AND mm.is_active = true
        AND (storage.foldername(name))[1] = 'merchants'
        AND (storage.foldername(name))[2] = mm.merchant_id::text
    )
  )
);

DROP POLICY IF EXISTS "Merchant owners can read their event posters" ON storage.objects;
CREATE POLICY "Merchant owners can read their event posters"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'event-posters' AND
  (
    -- Public read（如果 bucket 是 public）
    -- 或者 merchant owner 可以读取自己商户的文件
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid()
        AND mm.role = 'OWNER'
        AND mm.is_active = true
        AND (storage.foldername(name))[1] = 'merchants'
        AND (storage.foldername(name))[2] = mm.merchant_id::text
    )
  )
);

DROP POLICY IF EXISTS "Merchant owners can delete their event posters" ON storage.objects;
CREATE POLICY "Merchant owners can delete their event posters"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-posters' AND
  (
    EXISTS (
      SELECT 1 FROM public.merchant_members mm
      WHERE mm.user_id = auth.uid()
        AND mm.role = 'OWNER'
        AND mm.is_active = true
        AND (storage.foldername(name))[1] = 'merchants'
        AND (storage.foldername(name))[2] = mm.merchant_id::text
    )
  )
);

-- 2.3 Public read（如果 bucket 设置为 public，允许所有人读取）
-- 注意：如果 bucket 是 private，这个 policy 不会生效
-- 如果需要 private bucket，移除这个 policy，使用 signed URL
DROP POLICY IF EXISTS "Public can read event posters" ON storage.objects;
CREATE POLICY "Public can read event posters"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'event-posters');

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Event posters storage policies created!';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: You must create the bucket manually:';
  RAISE NOTICE '   1. Go to Supabase Dashboard → Storage';
  RAISE NOTICE '   2. Click "Create Bucket"';
  RAISE NOTICE '   3. Name: event-posters';
  RAISE NOTICE '   4. Public: false (recommended) or true';
  RAISE NOTICE '   5. File size limit: 5MB';
  RAISE NOTICE '';
  RAISE NOTICE '   Or use Supabase CLI:';
  RAISE NOTICE '   supabase storage create event-posters --public false';
  RAISE NOTICE '========================================';
END $$;
