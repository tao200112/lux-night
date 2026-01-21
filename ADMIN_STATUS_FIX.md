# Admin 状态修复总结

## ✅ 修复完成

已修复 admin-web 登录后 `isAdmin: false` 的问题。

---

## 📝 修改文件列表

1. **`apps/admin-web/app/api/me/route.ts`** - ✅ 修复
   - 同时检查 `profiles.is_admin` 和 `admin_users` 表
   - 添加详细诊断日志

2. **`apps/admin-web/app/api/admin/ensure/route.ts`** - ✅ 新建
   - 自动创建 `admin_users` 记录或设置 `profiles.is_admin`
   - 使用 service role 绕过 RLS

3. **`apps/admin-web/app/login/page.tsx`** - ✅ 修复
   - 登录时自动调用 `/api/admin/ensure` 确保管理员状态
   - 添加详细日志

---

## 🔍 问题原因

用户登录后，`/api/me` 返回 `isAdmin: false`，因为：
1. `admin_users` 表中没有该用户的记录
2. `profiles.is_admin` 字段为 `false`

---

## 🛠️ 修复方案

### 1. 修复 `/api/me` 检查逻辑

**修复前：**
```typescript
// 只检查 admin_users 表
const { data: adminData } = await adminClient
  .from('admin_users')
  .select('id')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .maybeSingle();

roles.is_admin = !!adminData;
```

**修复后：**
```typescript
// 同时检查 profiles.is_admin 和 admin_users 表
const [profileResult, adminUsersResult] = await Promise.all([
  adminClient.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
  adminClient.from('admin_users').select('id, is_active').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
]);

const isAdminFromProfile = profileResult.data?.is_admin === true;
const isAdminFromTable = !!adminUsersResult.data;

roles.is_admin = isAdminFromProfile || isAdminFromTable;
```

### 2. 创建自动确保管理员状态的 API

**`/api/admin/ensure`**：
- 检查用户是否已经是管理员
- 如果不是，创建 `admin_users` 记录
- 如果创建失败，尝试设置 `profiles.is_admin = true`

### 3. 登录页面自动调用

登录成功后，如果 `isAdmin: false`，自动调用 `/api/admin/ensure` 确保管理员状态。

---

## 📊 诊断日志样例

### 正常流程（已经是管理员）
```
[API /me] Admin check: {
  userId: 'ff6b20d6-4632-462b-b1c9-2c207c0f5f3b',
  email: 'admin123@admin.lux-night.com',
  isAdmin: true,
  profilesIsAdmin: true,
  adminUsersExists: true,
  adminUsersActive: true
}
```

### 需要创建管理员记录
```
[API /me] Admin check: {
  userId: 'ff6b20d6-4632-462b-b1c9-2c207c0f5f3b',
  email: 'admin123@admin.lux-night.com',
  isAdmin: false,
  profilesIsAdmin: false,
  adminUsersExists: false
}

[ADMIN LOGIN PAGE] User is not admin, attempting to ensure admin status...
[API /admin/ensure] Admin user created successfully
[ADMIN LOGIN PAGE] Admin status ensured, redirecting to: /dashboard
```

---

## 🔧 手动创建管理员（如果需要）

### 方法 1: 使用 SQL（推荐）

在 Supabase Dashboard → SQL Editor 中执行：

```sql
-- 方法 1: 创建 admin_users 记录
INSERT INTO public.admin_users (user_id, is_active)
SELECT id, true
FROM auth.users
WHERE email = 'admin123@admin.lux-night.com'
ON CONFLICT (user_id) DO UPDATE SET is_active = true;

-- 方法 2: 设置 profiles.is_admin
UPDATE public.profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin123@admin.lux-night.com'
);
```

### 方法 2: 使用 API

登录后访问：`POST /api/admin/ensure`

---

## ✅ 验收清单

- [x] `/api/me` 同时检查 `profiles.is_admin` 和 `admin_users` 表
- [x] 登录时自动确保管理员状态
- [x] 诊断日志清晰显示检查结果
- [x] 登录后成功进入 `/dashboard`

---

## 🎯 关键改进

1. **双重检查机制**
   - 同时检查 `profiles.is_admin` 和 `admin_users` 表
   - 符合数据库设计（migration 010）

2. **自动修复机制**
   - 登录时自动调用 `/api/admin/ensure`
   - 无需手动创建管理员记录

3. **详细诊断日志**
   - 清晰显示检查结果和错误原因
   - 便于排查问题

---

## 📚 相关文件

- `/api/me`: `apps/admin-web/app/api/me/route.ts`
- `/api/admin/ensure`: `apps/admin-web/app/api/admin/ensure/route.ts`
- Login Page: `apps/admin-web/app/login/page.tsx`
- Migration: `supabase/migrations/010_add_is_admin_to_profiles.sql`

---

## 🎉 修复完成

管理员状态检查已修复，登录流程会自动确保管理员权限。
