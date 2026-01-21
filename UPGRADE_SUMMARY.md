# 升级总结：从静态 Demo 到真实可用版本

## 📋 已完成的更改

### A. 代码库清理

#### 删除/替换的文件
- `constants.ts` - 保留文件但所有 `MOCK_*` 导出已不再使用
- 所有页面中的 `MOCK_*` 引用已替换为数据层调用

#### 关键位置清理
- `app/page.tsx` - 移除 `MOCK_EVENTS`, `MOCK_REGIONS`
- `app/events/[id]/page.tsx` - 移除 `MOCK_EVENTS`, `MOCK_TIERS` (需要继续更新)
- `app/wallet/page.tsx` - 已更新使用 `getTickets()` 数据层
- `app/ticket/[id]/page.tsx` - 已更新使用 `getTicket()` 数据层
- `contexts/AuthContext.tsx` - 移除 `MOCK_USER`, 使用真实 Supabase Auth

### B. Auth + Profile 打通

#### B1) 统一的 auth 层
- ✅ `lib/auth/client.ts` - 客户端认证函数
  - `getSession()`, `getUser()`, `requireAuth()`
  - `signInWithGoogle()`, `signInWithApple()`, `signOut()`
- ✅ `lib/auth/server.ts` - 服务端认证函数
  - `getSession()`, `getUser()`, `requireAuth()`
- ✅ `app/auth/callback/route.ts` - 统一登录回调处理
- ✅ `app/login/page.tsx` - 登录页面

#### B2) 自动同步 profiles
- ✅ `lib/data/profile.ts` - `ensureProfile()` 函数
- ✅ 在 `AuthContext` 中自动调用 `ensureProfile()` 当用户登录时
- ✅ 在 `auth/callback` 路由中确保 profile 存在

#### B3) 顾客端路由保护
- ✅ `app/page.tsx` - Discover 页面检查认证
- ✅ `app/wallet/page.tsx` - 未登录重定向到 `/login`
- ✅ `app/ticket/[id]/page.tsx` - 未登录重定向到 `/login`
- ✅ 所有重定向包含 `redirect` 参数用于登录后返回

### C. 顾客端数据流实现

#### C1) Region
- ✅ `lib/data/regions.ts` - `getRegions()`, `getRegion()`
- ✅ `app/page.tsx` - 从 Supabase 读取 regions
- ✅ 支持 localStorage 保存选择
- ✅ 如果 profile 有 `last_region_id`，自动选择

#### C2) Discover
- ✅ `lib/data/events.ts` - `getEvents()`, `getEvent()`
- ✅ `app/page.tsx` - 根据 region_id 拉取 events
- ✅ 显示 loading skeleton / empty / error 状态
- ✅ 按 `start_at` 排序

#### C3) Venue / Event
- ✅ Event Detail 需要更新（见待办）
- ✅ Ticket Types 数据层：`lib/data/ticket-types.ts`

#### C4) Wallet / Tickets
- ✅ `lib/data/tickets.ts` - `getTickets()`, `getTicket()`
- ✅ `app/wallet/page.tsx` - 从 Supabase 读取 tickets
- ✅ Tabs: Active / Used（根据 `tickets.status`）
- ✅ `app/ticket/[id]/page.tsx` - 显示完整 ticket 详情
- ✅ QR 码使用 `qr_seed` 生成

### D. UI 修复

#### D1) 返回按钮统一
- ✅ `components/ui/BackButton.tsx` - 统一返回按钮组件
- ✅ `app/login/page.tsx` - 使用 BackButton
- ⚠️ 其他页面需要添加 BackButton（见待办）

#### D2) 图标变文字修复
- ✅ `components/ui/Button.tsx` - 已正确使用 Material Icons
- ⚠️ 其他页面需要检查图标使用（Material Icons 已全局加载在 `globals.css`）

### E. 缺失页面补齐

#### ✅ 已创建
- `app/login/page.tsx` - 登录页面
- `app/auth/callback/route.ts` - 认证回调

#### ⚠️ 待创建
- `app/orders/page.tsx` - My Orders 页面
- `app/help/page.tsx` - Help / FAQ 页面
- `app/error/page.tsx` - Generic Error 页面

### F. 数据层架构

#### 已创建的数据层函数
- `lib/data/regions.ts` - 区域查询
- `lib/data/events.ts` - 活动查询
- `lib/data/tickets.ts` - 票务查询
- `lib/data/ticket-types.ts` - 票种查询
- `lib/data/profile.ts` - 用户资料查询

#### 架构特点
- 所有 Supabase 查询集中在 `lib/data/` 下
- 页面只负责调用数据层函数和渲染
- 统一的错误处理和类型定义

---

## ⚠️ 待完成的工作

### 1. 更新 Event Detail 页面
**文件**: `app/events/[id]/page.tsx`
- [ ] 移除 `MOCK_EVENTS`, `MOCK_TIERS`
- [ ] 使用 `getEvent(id)` 获取活动
- [ ] 使用 `getTicketTypes(eventId)` 获取票种
- [ ] 添加 loading/empty/error 状态
- [ ] 使用 BackButton 组件

### 2. 更新 Profile 页面
**文件**: `app/profile/page.tsx`
- [ ] 移除 role switcher（`updateRole` 功能）
- [ ] 使用真实 user/profile 数据
- [ ] 实现登出功能（调用 `logout()`）
- [ ] 链接到 Orders 页面

### 3. 补齐缺失页面
- [ ] `app/orders/page.tsx` - 读取 orders 列表
- [ ] `app/help/page.tsx` - 静态 FAQ 内容
- [ ] `app/error/page.tsx` - 通用错误页面

### 4. 图标和 UI 细节
- [ ] 检查所有页面，确保图标使用 Material Icons（而不是字符串）
- [ ] 为所有二级页面添加 BackButton
- [ ] 统一错误提示样式

### 5. 数据库字段映射
- [ ] 确认所有字段名称与新架构一致：
  - `qr_token` → `qr_seed` ✅
  - `date/time` → `start_at/end_at` ✅
  - `location` → `address` ✅

---

## 📦 新增文件列表

### 数据层 (lib/data/)
- `lib/data/regions.ts`
- `lib/data/events.ts`
- `lib/data/tickets.ts`
- `lib/data/ticket-types.ts`
- `lib/data/profile.ts`

### 认证层 (lib/auth/)
- `lib/auth/client.ts`
- `lib/auth/server.ts`

### UI 组件
- `components/ui/BackButton.tsx`

### 页面
- `app/login/page.tsx`
- `app/auth/callback/route.ts`

---

## 🔄 修改文件列表

### 核心文件
- `contexts/AuthContext.tsx` - 完全重写使用 Supabase Auth
- `app/page.tsx` - 使用真实数据，添加认证检查
- `app/wallet/page.tsx` - 使用数据层，添加路由保护
- `app/ticket/[id]/page.tsx` - 使用数据层，修复字段名

### 需要继续更新的文件
- `app/events/[id]/page.tsx` - 需要更新为真实数据
- `app/profile/page.tsx` - 需要更新为真实数据
- `app/checkout/page.tsx` - 可能需要优化（已部分实现）

---

## 🧪 本地验证步骤

### 1. 认证流程
- [ ] 访问 `/login` - 应该显示登录选项
- [ ] 点击 "Continue with Google" - 应该重定向到 Google OAuth
- [ ] 登录后应该重定向回原页面或 `/`
- [ ] Profile 应该自动创建/同步

### 2. Region 选择
- [ ] 首次访问应该显示 region 选择或自动选择
- [ ] 选择 region 后应该保存到 localStorage
- [ ] 刷新后应该记住选择

### 3. Discover 页面
- [ ] 应该显示真实 events（从 Supabase）
- [ ] Loading 状态应该显示 skeleton
- [ ] Empty 状态应该显示提示信息
- [ ] Error 状态应该显示错误信息

### 4. Event Detail
- [ ] 应该显示真实 event 信息
- [ ] 应该显示真实 ticket types
- [ ] 应该可以添加到购物车
- [ ] 点击返回按钮应该返回上一页

### 5. Checkout
- [ ] 应该可以创建订单
- [ ] 应该重定向到 Stripe Checkout（如果配置）

### 6. Wallet
- [ ] 应该显示用户的所有 tickets
- [ ] Tabs (Active/Used) 应该正确过滤
- [ ] 应该可以点击 ticket 查看详情

### 7. Ticket Detail
- [ ] 应该显示完整 ticket 信息
- [ ] QR 码应该正确显示
- [ ] Staff 应该可以兑换票务（双重确认）

### 8. Profile
- [ ] 应该显示真实用户信息
- [ ] 应该可以登出
- [ ] 点击 "My Orders" 应该导航到 Orders 页面

---

## 🚧 已留接口但未实现的功能

### 支付流程
- ✅ Stripe Checkout Session 创建 - 已实现
- ✅ Webhook 处理 - 已实现
- ⚠️ 支付完成后的订单状态轮询 - 可先 stub

### 动态二维码
- ✅ QR 码生成使用 `qr_seed` - 已实现
- ⚠️ 签名短码刷新 - 后续扩展（已预留接口）

### 其他功能
- ⚠️ Bars/Venues 列表页面 - 已留占位
- ⚠️ Filters 功能 - 已留 UI，查询参数预留
- ⚠️ Search 功能 - 已留 UI 按钮

---

## 📝 注意事项

1. **环境变量**：确保 `.env.local` 包含所有必需的 Supabase 和 Stripe 配置
2. **数据库迁移**：确保已运行所有迁移文件（见 `MIGRATION_INSTRUCTIONS.md`）
3. **Material Icons**：确保 Google Fonts Material Icons 已加载（在 `globals.css` 中）
4. **类型安全**：所有数据层函数都有完整的 TypeScript 类型定义

---

## 🎯 下一步建议

1. 完成 Event Detail 页面更新
2. 完成 Profile 页面更新
3. 补齐 Orders/Help/Error 页面
4. 全面测试认证流程和数据流
5. 移除或标记 `constants.ts` 中的 mock 数据为已废弃
