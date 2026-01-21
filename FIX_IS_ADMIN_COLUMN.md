# 修复 is_admin 列缺失问题

## ❌ 问题

运行 `setup-admin-user-simple.sql` 时出现错误：

```
ERROR: 42703: column p.is_admin does not exist
LINE 64: p.is_admin,
```

## 🔍 原因

`profiles` 表中没有 `is_admin` 列。当前的 `is_admin()` 函数检查的是 `admin_users` 表，而不是 `profiles.is_admin` 列。

## ✅ 解决方案

### 方案 1: 运行迁移（推荐）

运行新创建的迁移文件：

```bash
cd supabase
npx supabase db push
```

这将应用 `010_add_is_admin_to_profiles.sql` 迁移，添加 `is_admin` 列。

### 方案 2: 手动添加列

在 **Supabase Dashboard** → **SQL Editor** 中运行以下 SQL：

```sql
-- 添加 is_admin 列到 profiles 表
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- 更新 is_admin() 函数，同时检查 profiles.is_admin 和 admin_users 表
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID;
  v_profile_is_admin BOOLEAN;
  v_admin_user_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- 方法 1: 检查 profiles.is_admin
  SELECT COALESCE(is_admin, false) INTO v_profile_is_admin
  FROM public.profiles
  WHERE id = v_user_id;
  
  IF v_profile_is_admin THEN
    RETURN true;
  END IF;
  
  -- 方法 2: 检查 admin_users 表（向后兼容）
  SELECT EXISTS(
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = v_user_id 
      AND is_active = true
  ) INTO v_admin_user_exists;
  
  RETURN COALESCE(v_admin_user_exists, false);
END;
$$;
```

### 方案 3: 使用更新后的 SQL 脚本

已更新 `setup-admin-user-simple.sql`，它会自动检查并添加 `is_admin` 列（如果不存在）。

## 📋 验证

运行以下 SQL 验证 `is_admin` 列是否存在：

```sql
-- 检查列是否存在
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles' 
  AND column_name = 'is_admin';
```

应该返回：
- `column_name`: `is_admin`
- `data_type`: `boolean`
- `is_nullable`: `NO`
- `column_default`: `false`

## ✅ 修复后的步骤

1. **运行迁移或手动添加列**（见上方方案 1 或 2）

2. **创建 Admin 用户**（在 Supabase Dashboard 中）
   - Email: `admin123@admin.lux-night.com`
   - Password: `a146129887`

3. **运行 SQL 脚本设置权限**

在 **Supabase Dashboard** → **SQL Editor** 中运行更新后的 `setup-admin-user-simple.sql`（或手动运行以下 SQL）：

```sql
DO $$
DECLARE
  v_admin_email TEXT := 'admin123@admin.lux-night.com';
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_admin_email
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠️  请先创建用户：admin123@admin.lux-night.com';
    RETURN;
  END IF;
  
  -- 设置 profiles.is_admin = true
  INSERT INTO public.profiles (id, display_name, email, is_admin)
  VALUES (v_user_id, 'Admin', v_admin_email, true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    email = COALESCE(profiles.email, v_admin_email),
    updated_at = NOW();
  
  RAISE NOTICE '✅ Admin 用户设置完成！';
END $$;
```

4. **验证设置**

```sql
SELECT 
  u.id as user_id,
  u.email,
  p.display_name,
  p.is_admin
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
```

应该返回 `is_admin: true`。

## 📁 相关文件

- `supabase/migrations/010_add_is_admin_to_profiles.sql` - 新增迁移文件（添加 `is_admin` 列）
- `setup-admin-user-simple.sql` - 已更新的 SQL 脚本（自动检查并添加列）
- `supabase/scripts/setup-admin-user.sql` - 已更新的 SQL 脚本

## 🎯 总结

问题已修复：
1. ✅ 创建了迁移文件添加 `is_admin` 列
2. ✅ 更新了 `is_admin()` 函数同时检查 `profiles.is_admin` 和 `admin_users` 表
3. ✅ 更新了 SQL 脚本自动检查并添加列（如果不存在）

**下一步**：
1. 运行迁移：`cd supabase && npx supabase db push`
2. 或者手动添加列（见方案 2）
3. 然后运行 `setup-admin-user-simple.sql` 设置 Admin 权限
