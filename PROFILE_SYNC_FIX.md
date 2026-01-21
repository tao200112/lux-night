# Profile 同步修复方案

## 问题描述
- `profiles` 表为空，但 `auth.users` 表中有用户账号
- 新用户注册时，profile 没有自动创建
- 需要通用方案确保所有新用户都能自动同步创建 profile

## 解决方案

### 1. 数据库触发器（推荐方案）
使用 PostgreSQL 触发器在 `auth.users` 表插入新用户时自动创建 `profiles` 记录。

**文件**: `supabase/migrations/006_profile_sync_trigger.sql`

**功能**:
- 自动为新用户创建 profile（通过触发器）
- 为现有用户创建 profile（通过迁移函数）
- 使用 `SECURITY DEFINER` 绕过 RLS 策略
- 错误处理确保不会阻止用户创建

### 2. RLS 策略更新
添加 `profiles_insert_own` 策略，允许用户创建自己的 profile。

**文件**: `supabase/migrations/002_rls_policies.sql`

**更新内容**:
```sql
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());
```

### 3. 应用层回退方案
在应用代码中保留 `ensureProfile` 逻辑，作为回退方案。

**位置**:
- `contexts/AuthContext.tsx` - 客户端自动创建
- `app/auth/callback/route.ts` - OAuth 回调时创建
- `lib/data/profile.ts` - `ensureProfile` 函数

## 使用步骤

### 步骤 1: 运行触发器迁移
在 Supabase SQL Editor 中运行：
```sql
-- 运行 supabase/migrations/006_profile_sync_trigger.sql
```

这将：
1. 创建 `handle_new_user()` 触发器函数
2. 创建触发器 `on_auth_user_created`
3. 运行迁移函数为现有用户创建 profile

### 步骤 2: 验证现有用户已迁移
运行以下查询检查：
```sql
-- 检查是否有用户没有 profile
SELECT 
  au.id,
  au.email,
  au.created_at,
  CASE WHEN p.id IS NULL THEN 'Missing Profile' ELSE 'Has Profile' END as status
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
ORDER BY au.created_at DESC;
```

### 步骤 3: 验证触发器工作
创建一个新用户（通过注册或 OAuth），然后检查 `profiles` 表是否自动创建了对应的记录。

## 工作原理

### 触发器流程
1. 用户在 `auth.users` 表中被创建（通过 OAuth、Email 等方式）
2. `on_auth_user_created` 触发器自动触发
3. `handle_new_user()` 函数执行：
   - 从用户元数据中提取 `display_name`（优先顺序：full_name > name > display_name > email 前缀）
   - 在 `profiles` 表中插入新记录
   - 使用 `ON CONFLICT DO NOTHING` 防止重复插入

### 迁移现有用户
`migrate_existing_users_to_profiles()` 函数会：
- 查找所有没有 profile 的用户
- 为每个用户创建对应的 profile
- 返回迁移的用户数量

## 优势

1. **通用性**: 无论通过什么方式创建用户（OAuth、Email、Admin），都会自动创建 profile
2. **可靠性**: 数据库层面的触发器，不依赖应用代码
3. **向后兼容**: 包含迁移脚本，可以为现有用户创建 profile
4. **容错性**: 错误不会阻止用户创建，只会记录警告
5. **安全性**: 使用 `SECURITY DEFINER` 和 `WITH CHECK` 确保权限正确

## 注意事项

1. **权限**: 触发器函数使用 `SECURITY DEFINER`，需要确保函数有足够权限访问 `auth.users` 和 `public.profiles`
2. **RLS**: 虽然触发器使用 `SECURITY DEFINER` 绕过 RLS，但仍需要正确的 RLS 策略用于应用层访问
3. **性能**: 触发器是同步执行的，但创建 profile 的操作很轻量，不会显著影响性能
4. **测试**: 建议在测试环境先运行，验证无误后再在生产环境执行

## 故障排除

如果触发器不工作，检查：
1. 触发器是否正确创建：`SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';`
2. 函数是否正确创建：`SELECT * FROM pg_proc WHERE proname = 'handle_new_user';`
3. 是否有错误日志：查看 Supabase Dashboard 的 Logs

## 回退方案

如果触发器不工作，应用层的 `ensureProfile` 会作为回退：
- `AuthContext` 在加载用户时检查并创建 profile
- `auth/callback` 路由在 OAuth 回调时创建 profile

这样确保无论哪种情况，用户都有对应的 profile。
