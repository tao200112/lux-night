# 商家端部署检查清单

## ✅ 前置条件（已完成）

- ✅ 数据库迁移已完成（手动）
- ✅ 开发服务器已启动：http://localhost:3000

## 🔍 环境变量检查

确保 `.env.local` 包含以下变量：

```env
# Supabase（必需）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe（可选，用于支付功能）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 🧪 商家端功能测试清单

### 1. 内部端登录页面

**URL**: http://localhost:3000/internal/login

**测试步骤**:
- [ ] 页面正常显示
- [ ] "Continue with Google" 按钮可点击
- [ ] "Continue with Apple" 按钮可点击
- [ ] 点击后能跳转到 OAuth 登录

### 2. 邀请码门禁

**URL**: http://localhost:3000/internal/invite

**测试步骤**:
- [ ] 登录后（无 workspace）自动跳转到此页面
- [ ] 可以输入邀请码
- [ ] 点击 "Verify Code" 可以提交
- [ ] 无效邀请码显示错误信息
- [ ] 有效邀请码成功兑换并跳转

**测试数据**:
```sql
-- 创建测试邀请码（在 Supabase SQL Editor 中运行）
INSERT INTO invites (
  merchant_id, 
  intended_role, 
  token, 
  max_uses, 
  expires_at, 
  created_by, 
  is_active
) VALUES (
  'your-merchant-id',
  'STAFF',
  'TEST1234',
  10,
  NOW() + INTERVAL '30 days',
  'your-admin-user-id',
  true
);
```

### 3. Workspace 选择

**URL**: http://localhost:3000/internal/workspaces

**测试步骤**:
- [ ] 兑换邀请码后自动跳转到此页面
- [ ] 显示所有可用的 workspace
- [ ] 可以选择 workspace
- [ ] 点击 "Continue" 可以设置默认 workspace 并跳转

### 4. Staff 扫码核销

**URL**: http://localhost:3000/internal/scan

**前置条件**: 用户必须是 STAFF 角色

**测试步骤**:
- [ ] 页面正常显示
- [ ] 可以输入票据代码
- [ ] 可以手动查找票据
- [ ] 核销功能可以正常使用

### 5. Dashboard（Merchant）

**URL**: http://localhost:3000/internal/dashboard

**前置条件**: 用户必须是 MANAGER/OWNER 角色

**测试步骤**:
- [ ] 页面正常显示
- [ ] 显示 KPI 数据（活动数、票据数、今日核销数、收入）
- [ ] 显示今晚活动列表

### 6. 活动管理

**URL**: http://localhost:3000/internal/events

**测试步骤**:
- [ ] 显示活动列表
- [ ] 可以按状态过滤
- [ ] 可以查看活动详情

### 7. API 端点测试

使用浏览器或 Postman 测试以下 API：

#### 获取用户信息
```bash
GET http://localhost:3000/api/internal/me
Authorization: Bearer <your-jwt-token>
```

#### 搜索票据
```bash
GET http://localhost:3000/api/internal/tickets/search?q=ticket-code
Authorization: Bearer <your-jwt-token>
```

#### 核销票据
```bash
POST http://localhost:3000/api/internal/checkins
Content-Type: application/json
Authorization: Bearer <your-jwt-token>

{
  "ticketCode": "ticket-id-or-code",
  "action": "ENTRY",
  "venueId": "venue-id"
}
```

#### 获取 Dashboard 数据
```bash
GET http://localhost:3000/api/internal/dashboard?venue_id=venue-id
Authorization: Bearer <your-jwt-token>
```

## 🔧 常见问题排查

### 问题 1: 路由 404

**检查项**:
- [ ] `app/internal/` 目录下页面文件是否存在
- [ ] 文件名是否正确（`page.tsx`）
- [ ] 中间件是否正确配置

### 问题 2: 认证失败

**检查项**:
- [ ] Supabase 环境变量是否正确
- [ ] OAuth 配置是否正确（在 Supabase Dashboard → Authentication → Providers）
- [ ] 浏览器控制台是否有错误

### 问题 3: 权限错误

**检查项**:
- [ ] 用户是否有 `merchant_members` 记录
- [ ] `merchant_members.is_active = true`
- [ ] RLS 策略是否正确

### 问题 4: API 返回 401/403

**检查项**:
- [ ] JWT token 是否有效
- [ ] 用户是否已登录
- [ ] workspace 是否已选择

## 📝 测试用户创建

### 创建测试商家和管理员

```sql
-- 1. 创建测试商家
INSERT INTO merchants (region_id, name, status)
VALUES (
  (SELECT id FROM regions LIMIT 1),
  '测试商家',
  'active'
) RETURNING id;

-- 2. 将当前用户添加为商家管理员
INSERT INTO merchant_members (merchant_id, user_id, role, is_active)
VALUES (
  'your-merchant-id',
  auth.uid(),  -- 当前登录用户
  'OWNER',
  true
) ON CONFLICT (merchant_id, user_id) 
DO UPDATE SET role = 'OWNER', is_active = true;

-- 3. 创建测试 venue
INSERT INTO venues (merchant_id, region_id, name, address, timezone, is_active)
VALUES (
  'your-merchant-id',
  (SELECT region_id FROM merchants WHERE id = 'your-merchant-id'),
  '测试店铺',
  '测试地址',
  'America/New_York',
  true
) RETURNING id;
```

## 🎯 快速验证脚本

在浏览器控制台运行以下代码，快速验证 API：

```javascript
// 获取当前用户信息
async function testInternalAPI() {
  const response = await fetch('/api/internal/me');
  const data = await response.json();
  console.log('User info:', data);
  return data;
}

// 测试邀请码兑换
async function testInviteRedeem(token) {
  const response = await fetch('/api/internal/invites/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  const data = await response.json();
  console.log('Redeem result:', data);
  return data;
}

// 测试 workspace 选择
async function testWorkspaceSelect(merchantId, venueId) {
  const response = await fetch('/api/internal/workspace/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantId, venueId })
  });
  const data = await response.json();
  console.log('Workspace selected:', data);
  return data;
}
```

## 🚀 下一步

1. ✅ 验证所有页面可访问
2. ✅ 测试登录流程
3. ✅ 测试邀请码兑换
4. ✅ 测试核心功能（扫码、Dashboard等）
5. 📝 根据实际需求调整 UI 和功能

## 📚 相关文档

- [INTERNAL_MERCHANT_DELIVERY.md](./INTERNAL_MERCHANT_DELIVERY.md) - 完整功能文档
- [LOCAL_DEPLOYMENT.md](./LOCAL_DEPLOYMENT.md) - 部署指南
- [SUPABASE_CLI_SETUP.md](./SUPABASE_CLI_SETUP.md) - Supabase CLI 配置
