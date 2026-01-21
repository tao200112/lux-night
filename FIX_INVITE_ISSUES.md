# 邀请码问题修复指南

## 问题 1: 两个账号进入了同一个商家身份

### 原因
两个不同的账号输入了同一个邀请码 `1461`，导致它们都成为了同一个 merchant 的成员。

### 解决方案：为 taoliu001711@gmail.com 创建独立商家身份

#### 方法 1: 使用 SQL 脚本（推荐）

1. **执行 SQL 脚本创建新的商家和邀请码**：
   ```bash
   # 在 Supabase Dashboard SQL Editor 中执行
   # 文件: CREATE_MERCHANT_INVITE_FOR_USER.sql
   ```

2. **脚本会**：
   - 创建一个新的 merchant: "Merchant for taoliu001711@gmail.com"
   - 生成一个唯一的邀请码（6位字母数字）
   - 设置为 `owner` 角色，无限制使用，永不过期

3. **获取生成的邀请码**：
   - 执行脚本后，查看 Supabase Dashboard 的日志输出
   - 或者执行查询：
     ```sql
     SELECT token, intended_role, merchant_id, note
     FROM public.invites
     WHERE note LIKE '%taoliu001711@gmail.com%'
     ORDER BY created_at DESC
     LIMIT 1;
     ```

4. **使用新邀请码**：
   - 使用 `taoliu001711@gmail.com` 账号登录商家端
   - 在 `/invite` 页面输入新生成的邀请码
   - 完成后，该账号将拥有独立的商家身份

#### 方法 2: 使用 Admin API

如果需要在代码中动态创建，可以使用 `/api/admin/invites/create-merchant` API（需要 `SUPABASE_SERVICE_ROLE_KEY`）。

```bash
curl -X POST http://localhost:3001/api/admin/invites/create-merchant \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "<existing-merchant-id>",
    "role": "owner",
    "token": "CUSTOM-TOKEN",
    "maxUses": 999999,
    "expiresDays": null
  }'
```

### 验证独立身份

执行以下查询确认：

```sql
-- 查看 taoliu001711@gmail.com 的 merchant_members
SELECT 
  u.email,
  mm.role,
  mm.is_active,
  m.name AS merchant_name,
  m.id AS merchant_id
FROM auth.users u
INNER JOIN public.merchant_members mm ON mm.user_id = u.id
INNER JOIN public.merchants m ON m.id = mm.merchant_id
WHERE u.email = 'taoliu001711@gmail.com';
```

应该只看到一个 merchant，且与其他账号的 merchant 不同。

---

## 问题 2: 员工邀请码生成出错（404）

### 原因
前端页面 `/staff` 中的 "Generate Invite" 按钮链接指向 `/invites/create`，但该页面不存在。

### 已修复

1. **创建了 `/invites/create` 页面**：
   - 文件：`apps/internal-web/app/invites/create/page.tsx`
   - 提供表单用于创建员工邀请码
   - 支持选择 role (staff/manager)、max uses、expires days

2. **修复了 API 路由**：
   - `apps/internal-web/app/api/invites/create/route.ts`
   - 更正了 RPC 函数调用：`create_invite_code` → `create_staff_invite`
   - 更正了参数名：`p_role` → `p_intended_role`

### 使用方法

1. **访问生成页面**：
   - 登录商家端
   - 进入 `/staff` 页面
   - 点击 "Generate Invite" 按钮
   - 现在应该正确跳转到 `/invites/create`

2. **填写表单**：
   - **Role**: 选择 `Staff` 或 `Manager`
   - **Max Uses**: 邀请码可使用次数（默认 10）
   - **Expires in (days)**: 有效期天数（默认 30）

3. **生成邀请码**：
   - 点击 "Generate Invite Code"
   - 成功后显示生成的 6 位邀请码
   - 可以复制到剪贴板

### 验证修复

1. **检查页面路由**：
   - 访问 `http://localhost:3001/invites/create`
   - 应该看到创建邀请码的表单

2. **检查 API 调用**：
   - 打开浏览器 DevTools Network 标签
   - 提交表单后应该看到 `POST /api/invites/create` 请求
   - 应该返回 200 状态码和包含 `token` 的 JSON 响应

3. **检查生成的邀请码**：
   - 在 Supabase Dashboard 查询：
     ```sql
     SELECT token, intended_role, max_uses, used_count, expires_at, created_at
     FROM public.invites
     WHERE issued_by_type = 'merchant'
     ORDER BY created_at DESC
     LIMIT 5;
     ```

---

## 附加说明

### 邀请码类型

1. **ADMIN_TO_MERCHANT** (`issued_by_type = 'admin'`):
   - 用于创建新的 merchant 或加入已有 merchant 作为 owner/manager
   - 通常无限制使用
   - 示例：种子数据中的 `1461`

2. **MERCHANT_TO_STAFF** (`issued_by_type = 'merchant'`):
   - 由 merchant owner/manager 生成
   - 用于邀请员工加入已有 merchant
   - 可限制使用次数和有效期
   - 只能创建 `staff` 或 `manager` 角色

### 注意事项

1. **邀请码唯一性**：
   - 所有邀请码的 `token` 必须唯一
   - 系统会自动生成 6 位字母数字代码
   - 也可以手动指定（通过 admin API）

2. **角色权限**：
   - 只有 `owner`、`manager` 或 `admin` 可以创建员工邀请码
   - `staff` 不能创建邀请码

3. **一次性使用**：
   - 虽然可以设置 `max_uses`，但每个用户只能使用一次邀请码加入同一个 merchant
   - 如果用户已是该 merchant 成员，使用邀请码只会升级角色（如果邀请码角色更高）
