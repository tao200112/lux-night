# 商家端（Internal Merchant/Staff）交付清单

## 📋 交付概览

本次交付将「Internal 商家端（Staff + Merchant）」从静态 UI 变成可用产品，包括后端数据模型、RLS、安全校验、API 路由、以及前端页面交互与状态管理。

## 1. 新增/修改/删除文件清单

### 数据库迁移文件

#### 新增文件
- `supabase/migrations/009_internal_merchant_setup.sql`
  - 补充 invites 表的 venue_id 字段
  - 创建 member_venues 表（控制员工可访问的venue）
  - 补充 profiles 表的默认 workspace 字段
  - 创建 requests 和 request_events 表（申请制系统）
  - 更新 checkins 表支持幂等性（success 字段和唯一约束）

- `supabase/migrations/010_internal_rls_and_rpc.sql`
  - 更新 redeem_invite RPC 支持 venue_id 和 member_venues
  - 更新 checkin_ticket RPC 支持 venue 权限校验、幂等性和 success 标记
  - 创建 get_user_workspaces RPC
  - 更新 RLS 策略：允许 staff 插入 checkins、member_venues、requests、request_events

### 内部端 Lib 工具函数

#### 新增目录和文件
- `lib/internal/auth.ts` - 内部端认证工具函数
  - `getInternalUser()` - 获取当前用户的内部端信息
  - `requireInternalAuth()` - 要求用户已登录
  - `hasWorkspace()` - 检查用户是否有workspace

- `lib/internal/workspace.ts` - Workspace 管理工具函数
  - `setDefaultWorkspace()` - 设置默认workspace
  - `getActiveWorkspace()` - 获取当前活跃workspace

- `lib/internal/permissions.ts` - 权限检查工具函数
  - `canManageMerchant()` - 检查是否有merchant管理权限
  - `hasMerchantRole()` - 检查是否有指定merchant角色
  - `isAdmin()` - 检查是否是admin
  - `canAccessVenue()` - 检查是否可以访问指定venue

### 内部端数据查询函数

#### 新增目录和文件
- `lib/data/internal/workspaces.ts` - Workspace 数据查询
- `lib/data/internal/checkins.ts` - 核销数据查询
  - `checkinTicket()` - 核销票据
  - `findTicketByCode()` - 通过代码查找票据
  - `searchTickets()` - 搜索票据（手动查找）

- `lib/data/internal/events.ts` - 活动数据查询
  - `getMerchantEvents()` - 获取merchant活动列表
  - `getEventById()` - 获取单个活动详情

- `lib/data/internal/invites.ts` - 邀请码数据查询
  - `getInvites()` - 获取邀请码列表
  - `createInvite()` - 创建邀请码
  - `redeemInvite()` - 兑换邀请码

- `lib/data/internal/requests.ts` - 申请数据查询
  - `getRequests()` - 获取申请列表
  - `getRequestById()` - 获取单个申请详情
  - `createRequest()` - 创建申请

- `lib/data/internal/staff.ts` - 员工数据查询
  - `getStaffMembers()` - 获取员工列表
  - `updateStaffStatus()` - 更新员工状态

- `lib/data/internal/dashboard.ts` - Dashboard 数据查询
  - `getDashboardStats()` - 获取dashboard统计信息

### 内部端 API 路由

#### 新增目录和文件
- `app/api/internal/me/route.ts` - 获取当前用户内部端信息
- `app/api/internal/invites/redeem/route.ts` - 兑换邀请码
- `app/api/internal/workspace/select/route.ts` - 设置默认workspace
- `app/api/internal/checkins/route.ts` - 核销票据
- `app/api/internal/tickets/search/route.ts` - 搜索票据
- `app/api/internal/dashboard/route.ts` - 获取dashboard统计
- `app/api/internal/events/route.ts` - 获取活动列表
- `app/api/internal/events/[id]/route.ts` - 获取单个活动详情
- `app/api/internal/invites/create/route.ts` - 创建邀请码
- `app/api/internal/staff/route.ts` - 获取员工列表
- `app/api/internal/staff/[memberId]/route.ts` - 更新员工状态
- `app/api/internal/requests/route.ts` - 获取/创建申请
- `app/api/internal/requests/[id]/route.ts` - 获取单个申请详情
- `app/api/internal/admin/requests/[id]/approve/route.ts` - 审批申请
- `app/api/internal/admin/requests/[id]/reject/route.ts` - 拒绝申请

### 内部端前端页面

#### 新增目录和文件
- `app/internal/layout.tsx` - 内部端布局组件
- `app/internal/login/page.tsx` - 内部端登录页面 ✅
- `app/internal/invite/page.tsx` - 邀请码门禁页面 ✅
- `app/internal/workspaces/page.tsx` - Workspace 选择页面 ✅

#### 待实现页面（需要根据 UI 文档完成）
- `app/internal/join/page.tsx` - 加入确认页面
- `app/internal/scan/page.tsx` - 扫码核销页面
- `app/internal/scan/result/page.tsx` - 核销结果页面
- `app/internal/lookup/page.tsx` - 手动查找页面
- `app/internal/ticket/[id]/page.tsx` - 票据详情页面
- `app/internal/dashboard/page.tsx` - Dashboard 页面
- `app/internal/events/page.tsx` - 活动列表页面
- `app/internal/events/[id]/page.tsx` - 活动详情页面
- `app/internal/staff/page.tsx` - 员工管理页面
- `app/internal/invites/new/page.tsx` - 生成邀请码页面
- `app/internal/requests/page.tsx` - 申请中心页面
- `app/internal/requests/new-event/page.tsx` - 提交活动申请页面
- `app/internal/requests/price-change/page.tsx` - 提交改价申请页面
- `app/internal/requests/venue-edit/page.tsx` - 提交店铺编辑申请页面
- `app/internal/admin/requests/page.tsx` - Admin 审核队列页面

### 中间件

#### 新增文件
- `middleware.ts` - Next.js 中间件
  - 处理内部端路由保护
  - 检查用户认证和workspace
  - 重定向到登录或邀请码门禁

## 2. Migration SQL 清单

### 009_internal_merchant_setup.sql
- ✅ 补充 invites 表的 venue_id 字段
- ✅ 创建 member_venues 表
- ✅ 补充 profiles 表的默认 workspace 字段
- ✅ 补充 invites 表的 disabled 字段
- ✅ 更新 checkins 表支持幂等性（success 字段和唯一约束）
- ✅ 创建 requests 表
- ✅ 创建 request_events 表
- ✅ 更新 merchant_members 表的 role 约束（添加 'admin'）

### 010_internal_rls_and_rpc.sql
- ✅ 更新 redeem_invite RPC
- ✅ 更新 checkin_ticket RPC
- ✅ 创建 get_user_workspaces RPC
- ✅ 更新 checkins RLS 策略
- ✅ 创建 member_venues RLS 策略
- ✅ 创建 requests RLS 策略
- ✅ 创建 request_events RLS 策略

## 3. RLS/RPC SQL 说明

### RLS 策略

#### merchant_members
- **SELECT**: 用户可以读取自己的membership；owner/manager可以读取同商家所有成员
- **INSERT/UPDATE**: 只有owner/manager/admin可以创建和更新

#### invites
- **SELECT**: owner/manager/admin可以查看
- **INSERT/UPDATE**: 只有owner/manager/admin可以创建和更新
- **REDEEM**: 通过RPC函数实现，任何已登录用户都可以兑换

#### checkins
- **SELECT**: staff/manager/owner/admin可以查看自己商家的核销记录
- **INSERT**: 通过RPC函数实现，只有staff/manager/owner/admin可以插入

#### member_venues
- **SELECT**: 用户可以查看与自己相关的记录；owner/manager可以查看同商家所有记录
- **INSERT/UPDATE/DELETE**: 只有owner/manager/admin可以管理

#### requests
- **SELECT**: 提交者可以查看自己的申请；owner/manager可以查看本商家所有申请；admin可以查看所有
- **INSERT**: 只有owner/manager可以创建
- **UPDATE**: 提交者可以撤回（status改为withdrawn）；admin可以审批（status改为approved/rejected）

#### request_events
- **SELECT**: 与requests相同的权限
- **INSERT**: 提交者或admin可以插入（自动插入，通过触发器或API）

### RPC 函数

#### redeem_invite(p_token TEXT)
- 兑换邀请码
- 创建或更新merchant_members
- 如果邀请码指定了venue，创建member_venues关联
- 更新invites的used_count

#### checkin_ticket(p_ticket_id, p_action, p_venue_id, ...)
- 核销票据
- 验证用户权限（必须是staff/manager/owner/admin，且对venue有访问权限）
- 幂等性检查（通过唯一约束保证）
- 更新tickets状态和redeemed_count
- 插入checkins记录（audit log）

#### get_user_workspaces()
- 获取当前用户的所有workspace
- 返回merchant信息、角色、可访问的venue列表

## 4. 本地运行与手动测试 Checklist

### 前置条件
- [ ] Supabase 项目已创建并配置
- 环境变量已设置（NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY）
- 已运行所有迁移文件（按顺序：001-010）

### 测试步骤

#### 1. 数据库迁移测试
- [ ] 运行 `009_internal_merchant_setup.sql`
  - 验证 invites 表有 venue_id 字段
  - 验证 member_venues 表存在
  - 验证 profiles 表有 default_merchant_id 和 default_venue_id 字段
  - 验证 checkins 表有 success 字段和唯一约束
  - 验证 requests 和 request_events 表存在

- [ ] 运行 `010_internal_rls_and_rpc.sql`
  - 验证 RPC 函数创建成功
  - 验证 RLS 策略创建成功

#### 2. 认证流程测试
- [ ] 访问 `/internal/login`
  - 验证页面正常显示
  - 点击 "Continue with Google" 可以跳转到 Google 登录
  - 点击 "Continue with Apple" 可以跳转到 Apple 登录

- [ ] 登录后（无workspace）
  - 验证自动重定向到 `/internal/invite`
  - 验证邀请码门禁页面正常显示

#### 3. 邀请码流程测试
- [ ] 在数据库中创建测试邀请码
  ```sql
  INSERT INTO invites (merchant_id, intended_role, token, max_uses, expires_at, created_by, is_active)
  VALUES (
    'merchant-id-here',
    'STAFF',
    'TEST1234',
    1,
    NOW() + INTERVAL '30 days',
    'admin-user-id-here',
    true
  );
  ```

- [ ] 在 `/internal/invite` 页面输入邀请码
  - 验证可以成功兑换
  - 验证重定向到 `/internal/workspaces` 或 `/internal/join`

#### 4. Workspace 选择测试
- [ ] 访问 `/internal/workspaces`
  - 验证可以显示所有workspace
  - 验证可以选择workspace
  - 验证点击 "Continue" 可以设置默认workspace并跳转

- [ ] 测试角色路由
  - STAFF 角色应跳转到 `/internal/scan`
  - MANAGER/OWNER 角色应跳转到 `/internal/dashboard`

#### 5. 核销流程测试（Staff）
- [ ] 访问 `/internal/scan`
  - 验证页面正常显示
  - 验证可以输入票据代码进行核销
  - 验证离线状态检测（navigator.onLine）

- [ ] 测试核销API
  ```bash
  POST /api/internal/checkins
  {
    "ticketCode": "ticket-id-or-code",
    "action": "ENTRY",
    "venueId": "venue-id-here"
  }
  ```
  - 验证成功核销返回 result: "OK"
  - 验证重复核销返回 result: "ALREADY_USED"
  - 验证错误venue返回 result: "WRONG_VENUE"
  - 验证权限不足返回 result: "NOT_ALLOWED"

#### 6. Dashboard 测试（Merchant）
- [ ] 访问 `/internal/dashboard`
  - 验证可以显示KPI数据（活动数、票据数、今日核销数、收入）
  - 验证可以显示今晚活动列表

#### 7. 活动管理测试（Merchant）
- [ ] 访问 `/internal/events`
  - 验证可以显示活动列表
  - 验证可以按status过滤

- [ ] 访问 `/internal/events/[id]`
  - 验证可以显示活动详情
  - 验证可以显示票据类型列表
  - 验证可以提交改价申请

#### 8. 员工管理测试（Merchant）
- [ ] 访问 `/internal/staff`
  - 验证可以显示员工列表
  - 验证可以启用/禁用员工

- [ ] 访问 `/internal/invites/new`
  - 验证可以生成邀请码
  - 验证可以指定角色、venue、使用次数、过期时间

#### 9. 申请流程测试（Merchant）
- [ ] 访问 `/internal/requests`
  - 验证可以显示申请列表（pending/approved/rejected）
  - 验证可以按type过滤

- [ ] 提交活动申请
  - 访问 `/internal/requests/new-event`
  - 填写活动信息并提交
  - 验证申请状态为 pending

- [ ] 提交改价申请
  - 访问 `/internal/requests/price-change`
  - 选择活动、票据类型、新价格并提交
  - 验证申请状态为 pending

- [ ] 提交店铺编辑申请
  - 访问 `/internal/requests/venue-edit`
  - 填写店铺信息并提交
  - 验证申请状态为 pending

#### 10. Admin 审批测试
- [ ] 在数据库中设置用户为admin
  ```sql
  INSERT INTO admin_users (user_id, is_active)
  VALUES ('user-id-here', true);
  ```

- [ ] 访问 `/internal/admin/requests`
  - 验证可以显示所有pending申请
  - 验证可以查看申请详情

- [ ] 审批申请
  - 点击 "Approve" 按钮
  - 验证申请状态变为 approved
  - 验证request_events表中有记录

- [ ] 拒绝申请
  - 点击 "Reject" 按钮
  - 输入拒绝理由
  - 验证申请状态变为 rejected

#### 11. 权限测试
- [ ] 测试STAFF权限
  - 验证可以核销票据
  - 验证无法访问dashboard
  - 验证无法创建邀请码
  - 验证无法查看员工列表

- [ ] 测试MANAGER/OWNER权限
  - 验证可以访问dashboard
  - 验证可以创建邀请码
  - 验证可以查看员工列表
  - 验证可以提交申请

- [ ] 测试venue权限限制
  - 创建member_venues限制某staff只能访问特定venue
  - 验证该staff只能核销该venue的票据
  - 验证尝试核销其他venue票据返回 "NOT_ALLOWED"

#### 12. 离线队列测试（UI占位）
- [ ] 断开网络连接
  - 验证scan页面显示 "Offline" banner
  - 验证核销请求进入本地队列（localStorage）
  - 验证队列状态显示

- [ ] 恢复网络连接
  - 验证自动flush队列
  - 验证队列中的请求成功提交

## 5. 仍未实现但已留接口/占位的功能列表

### 已实现占位但需要完整实现的功能

1. **离线队列逻辑**
   - ✅ UI状态和banner已实现占位
   - ❌ 实际队列flush逻辑需要实现
   - ❌ IndexedDB存储需要实现
   - ❌ 重试机制需要实现

2. **Admin审批申请的实际业务逻辑**
   - ✅ API接口已实现
   - ✅ 数据库更新已实现
   - ❌ 申请审批后实际应用变更的逻辑（TODO标记）
     - venue_edit: 更新venue信息
     - new_event: 创建event
     - price_change: 更新ticket_type价格
     - inventory_change: 更新ticket_type库存

3. **扫码功能**
   - ✅ UI占位已实现
   - ❌ 实际摄像头扫码功能需要实现（使用react-qr-reader或类似库）
   - ❌ 手动输入票据代码功能已实现API，但前端页面需要实现

4. **Dashboard统计数据的完整实现**
   - ✅ 基础统计数据已实现
   - ❌ 图表可视化需要实现
   - ❌ 时间范围过滤需要实现

5. **活动详情页面的完整功能**
   - ✅ 数据获取已实现
   - ❌ UI页面需要实现
   - ❌ 改价申请表单需要实现

6. **员工详情页面**
   - ❌ UI页面需要实现
   - ❌ 编辑员工信息功能需要实现

7. **申请详情页面**
   - ✅ API已实现
   - ❌ UI页面需要实现
   - ❌ 查看request_events历史需要实现

### 需要额外开发的功能

1. **通知系统**
   - 申请审批通知（邮件/推送）
   - 核销异常通知

2. **报表导出**
   - 核销记录导出
   - 收入报表导出

3. **批量操作**
   - 批量核销
   - 批量生成邀请码

4. **高级权限控制**
   - 细粒度的venue权限控制
   - 自定义角色权限

## 6. 假设和默认值

1. **假设**
   - Supabase Auth已配置Google和Apple OAuth
   - 所有环境变量已正确配置
   - 数据库迁移已按顺序执行
   - 用户已理解内部端和顾客端的路由隔离

2. **默认值**
   - 邀请码token格式：8位大写字母数字
   - 默认workspace：使用第一个membership
   - 离线队列存储：localStorage（web）/ AsyncStorage（app，如未来迁移）
   - 默认venue选择：如果member_venues为空，可以访问所有venue

3. **待确认**
   - 邀请码token格式是否需要特定格式（如 XXX-XXX）？
   - 申请审批是否需要邮件通知？
   - Dashboard是否需要实时数据更新（WebSocket）？

## 7. 已知问题和限制

1. **限制**
   - Admin审批申请的实际业务逻辑需要根据具体业务规则实现
   - 离线队列的flush逻辑需要根据网络恢复情况优化
   - 某些查询可能需要优化（如dashboard统计数据）

2. **待优化**
   - Dashboard统计查询性能（可能需要materialized view）
   - 核销API的并发处理（虽然已有幂等性保护）
   - Workspace选择后的页面跳转逻辑（可能需要更智能的路由）

## 8. 后续开发建议

1. **短期（1-2周）**
   - 完成所有前端页面的UI实现（根据uimerchant目录中的设计）
   - 实现扫码功能的实际摄像头集成
   - 完善离线队列的flush逻辑

2. **中期（1个月）**
   - 实现Admin审批申请的实际业务逻辑
   - 添加通知系统（邮件/推送）
   - 优化Dashboard统计查询性能

3. **长期（2-3个月）**
   - 实现报表导出功能
   - 添加批量操作功能
   - 实现高级权限控制

---

**交付日期**: 2024-01-XX
**交付版本**: v1.0.0-internal
**状态**: ✅ 核心功能已完成，UI页面待完善
