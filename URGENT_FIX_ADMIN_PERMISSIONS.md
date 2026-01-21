# 紧急修复 Admin 权限问题

## ❌ 问题

数据库迁移已推送，但：
- `admin_users` 表为空（没有记录）
- `profiles.is_admin` 可能未设置为 `true`
- 登录后无法访问 Admin Portal

## 🔍 原因

迁移文件 `009_create_admin_user.sql` 和 `010_add_is_admin_to_profiles.sql` 只在**用户已存在**时设置权限。如果用户不存在或迁移运行时用户还未创建，就不会设置权限。

## ✅ 立即修复（在 Supabase Dashboard 中运行）

### 方法 1: 运行完整修复脚本（推荐）

在 **Supabase Dashboard** → **SQL Editor** 中运行 `fix-admin-permissions-complete.sql`：

这个脚本会：
1. ✅ 确保 `profiles.is_admin` 列存在
2. ✅ 查找 admin 用户 (`admin123@admin.lux-night.com`)
3. ✅ 设置 `profiles.is_admin = true`
4. ✅ 添加记录到 `admin_users` 表（如果表存在）
5. ✅ 验证设置结果

### 方法 2: 运行简单修复脚本

在 **Supabase Dashboard** → **SQL Editor** 中运行 `setup-admin-user-simple.sql`。

### 方法 3: 手动运行 SQL

在 **Supabase Dashboard** → **SQL Editor** 中运行以下 SQL：

```sql
-- 1. 查找 Admin 用户 ID
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
    RAISE NOTICE '⚠️  用户不存在，请先创建：admin123@admin.lux-night.com';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ 找到用户：% (ID: %)', v_admin_email, v_user_id;
  
  -- 2. 设置 profiles.is_admin = true
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES (v_user_id, 'Admin', true)
  ON CONFLICT (id) DO UPDATE
  SET
    is_admin = true,
    display_name = COALESCE(profiles.display_name, 'Admin'),
    updated_at = NOW();
  
  RAISE NOTICE '✅ 已设置 profiles.is_admin = true';
  
  -- 3. 添加到 admin_users 表
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO public.admin_users (user_id, is_active)
    VALUES (v_user_id, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_active = true, updated_at = NOW();
    
    RAISE NOTICE '✅ 已添加到 admin_users 表';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Admin 权限设置完成！';
END $$;

-- 4. 验证设置
SELECT 
  u.id as user_id,
  u.email,
  p.display_name,
  COALESCE(p.is_admin, false) as profiles_is_admin,
  CASE 
    WHEN EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = u.id) 
    THEN true 
    ELSE false 
  END as in_admin_users_table,
  au.is_active as admin_users_is_active
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.admin_users au ON au.user_id = u.id
WHERE u.email = 'admin123@admin.lux-night.com';
```

## 🔍 验证步骤

### 1. 检查 profiles.is_admin

```sql
SELECT 
  id, 
  display_name, 
  is_admin 
FROM public.profiles 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin123@admin.lux-night.com'
);
```

应该返回 `is_admin: true`。

### 2. 检查 admin_users 表

```sql
SELECT * FROM public.admin_users 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin123@admin.lux-night.com'
);
```

应该有 1 条记录，`is_active: true`。

### 3. 测试 is_admin() 函数

以 admin 用户身份登录后，运行：

```sql
SELECT public.is_admin() as is_admin;
```

应该返回 `true`。

## 📋 为什么迁移推送"没用"？

迁移推送成功只是表示：
- ✅ SQL 语句执行成功（没有语法错误）
- ✅ 表结构和列已创建
- ✅ 函数已定义

但**不会自动**：
- ❌ 创建用户（需要在 Dashboard 中手动创建）
- ❌ 设置 `profiles.is_admin = true`（如果用户不存在）
- ❌ 添加 `admin_users` 记录（如果用户不存在）

因此，**必须手动运行修复脚本**来设置权限。

## ✅ 修复后的验证清单

- [ ] `profiles.is_admin = true` 已设置
- [ ] `admin_users` 表有记录（`is_active = true`）
- [ ] `is_admin()` 函数返回 `true`（以 admin 用户身份测试）
- [ ] 可以登录 Admin Portal
- [ ] 登录后可以访问 Dashboard

## 🎯 总结

**立即行动**：
1. 在 Supabase Dashboard → SQL Editor 中运行 `fix-admin-permissions-complete.sql`
2. 或手动运行上面的 SQL
3. 验证权限设置
4. 刷新浏览器并重新登录

迁移推送只是"准备数据库结构"，设置权限需要"手动运行脚本"。
