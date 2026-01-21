# Merchant 移动端全栈实现计划

## Phase 1: UI 文档扫描与路由映射

### 📋 UI 页面清单（共 30 个）

| UI 文件夹名 | 页面类型 | 描述 |
|------------|---------|------|
| `internal_login` | AUTH | 登录页面（Google/Apple SSO） |
| `invite_code_gate` | ONBOARDING | 邀请码输入页面 |
| `invite_gate__invalid_error` | ONBOARDING | 邀请码无效错误页 |
| `join_merchant_confirmation` | ONBOARDING | 加入商户确认页 |
| `select_workspace` | ONBOARDING | 选择工作区 |
| `role_routing_&_venue_select_1` | ONBOARDING | 角色路由 & 场地选择步骤1 |
| `role_routing_&_venue_select_2` | ONBOARDING | 角色路由 & 场地选择步骤2 |
| `system__no_access` | ERROR | 无权限访问页 |
| `system__error_&_retry` | ERROR | 错误重试页 |
| `merchant_dashboard` | BOSS | 商户仪表板（主页） |
| `dashboard__loading_state` | LOADING | Dashboard 加载骨架屏 |
| `merchant__event_list` | BOSS | 活动列表页 |
| `merchant__event_detail` | BOSS | 活动详情页 |
| `request_center_list` | BOSS | 申请中心列表 |
| `new_event_request` | BOSS | 新建活动申请 |
| `price_change_request` | BOSS | 价格变更申请 |
| `venue_settings` | BOSS | 场地设置 |
| `venue_quick_switch` | BOSS | 快速切换场地 |
| `staff_management_list` | BOSS | 员工管理列表 |
| `staff_member_detail` | BOSS | 员工详情页 |
| `staff__ticket_scanner` | STAFF | 票务扫码器（主页面） |
| `staff__ticket_details` | STAFF | 票务详情页 |
| `staff__confirm_check-in` | STAFF | 确认核销页 |
| `staff__manual_lookup` | STAFF | 手动查询票务 |
| `staff__scan_success_1` | STAFF | 扫码成功状态1 |
| `staff__scan_success_2` | STAFF | 扫码成功状态2 |
| `staff_scan__offline_state` | STAFF | 离线状态页 |
| `scan__wrong_venue_error` | STAFF/ERROR | 错误场地错误页 |
| `scan__duplicate_warning` | STAFF/ERROR | 重复核销警告页 |

---

### 🗺️ 路由映射表

#### A. 认证与准入路由

| 路由路径 | UI 文档 | 说明 | 状态 |
|---------|---------|------|------|
| `/login` | `internal_login` | 登录页（Google/Apple） | ✅ 已有（需对齐UI） |
| `/onboarding/invite` | `invite_code_gate` | 邀请码输入 | ✅ 已有（需对齐UI） |
| `/onboarding/invite/invalid` | `invite_gate__invalid_error` | 邀请码无效 | ❌ 缺失 |
| `/onboarding/join-confirm` | `join_merchant_confirmation` | 加入确认 | ✅ 已有 `/join` |
| `/onboarding/select-workspace` | `select_workspace` | 选择工作区 | ✅ 已有 `/workspaces` |
| `/onboarding/select-venue` | `role_routing_&_venue_select_1/2` | 选择场地（2步） | ❌ 缺失 |
| `/error` | `system__error_&_retry` | 错误重试页 | ❌ 缺失 |
| `/no-access` | `system__no_access` | 无权限页 | ❌ 缺失 |

#### B. Boss/管理端路由

| 路由路径 | UI 文档 | 说明 | 状态 |
|---------|---------|------|------|
| `/` | `merchant_dashboard` | Dashboard（主页） | ✅ 已有（需对齐UI） |
| `/events` | `merchant__event_list` | 活动列表 | ✅ 已有 |
| `/events/[eventId]` | `merchant__event_detail` | 活动详情 | ❌ 缺失 |
| `/requests` | `request_center_list` | 申请中心 | ❌ 缺失 |
| `/requests/new-event` | `new_event_request` | 新建活动申请 | ❌ 缺失 |
| `/requests/price-change` | `price_change_request` | 价格变更申请 | ❌ 缺失 |
| `/settings/venue` | `venue_settings` | 场地设置 | ❌ 缺失 |
| `/venue-switch` | `venue_quick_switch` | 快速切换场地 | ❌ 缺失 |
| `/staff` | `staff_management_list` | 员工管理列表 | ✅ 已有 |
| `/staff/[staffId]` | `staff_member_detail` | 员工详情 | ❌ 缺失 |

#### C. Staff/核销端路由

| 路由路径 | UI 文档 | 说明 | 状态 |
|---------|---------|------|------|
| `/scan` | `staff__ticket_scanner` | 扫码器主页 | ✅ 已有 |
| `/scan/tickets/[ticketId]` | `staff__ticket_details` | 票务详情 | ❌ 缺失 |
| `/scan/confirm` | `staff__confirm_check-in` | 确认核销 | ❌ 缺失 |
| `/scan/manual-lookup` | `staff__manual_lookup` | 手动查询 | ❌ 缺失 |
| `/scan/success-1` | `staff__scan_success_1` | 成功状态1 | ❌ 缺失 |
| `/scan/success-2` | `staff__scan_success_2` | 成功状态2 | ❌ 缺失 |
| `/scan/offline` | `staff_scan__offline_state` | 离线状态 | ❌ 缺失 |
| `/scan/wrong-venue` | `scan__wrong_venue_error` | 错误场地 | ❌ 缺失 |
| `/scan/duplicate` | `scan__duplicate_warning` | 重复核销 | ❌ 缺失 |

---

### 🔄 状态机与跳转关系

```
┌─────────────────────────────────────────────────────────────┐
│                    应用启动入口                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   未登录 / 无 session   │
         └────────────┬───────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   /login               │◄──────────────┐
         │   (internal_login)     │                │
         └────────────┬───────────┘                │
                      │                            │
          [Google/Apple SSO 登录成功]              │
                      │                            │
                      ▼                            │
         ┌────────────────────────┐                │
         │   检查 merchant_members │                │
         └────────────┬───────────┘                │
                      │                            │
          ┌───────────┴───────────┐                │
          │                       │                │
     [无 membership]        [有 membership]        │
          │                       │                │
          ▼                       ▼                │
┌──────────────────┐    ┌──────────────────┐      │
│ /onboarding/     │    │ 检查默认workspace│      │
│ invite           │    └────────┬─────────┘      │
│ (invite_code)    │             │                 │
└────────┬─────────┘             │                 │
         │                       │                 │
  [输入邀请码]            ┌───────┴───────┐        │
         │               │               │        │
         ▼               │               │        │
┌──────────────────┐     │               │        │
│ /onboarding/     │     │               │        │
│ join-confirm     │     │               │        │
└────────┬─────────┘     │               │        │
         │               ▼               ▼        │
  [确认加入]      [无默认]      [有默认 workspace]│
         │               │               │        │
         └───────┬───────┘               │        │
                 │                       │        │
                 ▼                       │        │
      ┌──────────────────┐               │        │
      │ /onboarding/     │               │        │
      │ select-workspace │               │        │
      └────────┬─────────┘               │        │
               │                         │        │
      [选择 workspace]                   │        │
               │                         │        │
               ▼                         │        │
      ┌──────────────────┐               │        │
      │ /onboarding/     │               │        │
      │ select-venue     │               │        │
      └────────┬─────────┘               │        │
               │                         │        │
      [选择 venue]                       │        │
               │                         │        │
               └───────────┬─────────────┘        │
                           │                     │
                           ▼                     │
                ┌──────────────────┐             │
                │   按 role 路由    │             │
                └────────┬─────────┘             │
                         │                       │
          ┌──────────────┴──────────────┐        │
          │                             │        │
    [BOSS/MANAGER]              [STAFF] │        │
          │                             │        │
          ▼                             ▼        │
┌──────────────────┐          ┌──────────────────┐
│ /                │          │ /scan            │
│ (dashboard)      │          │ (ticket_scanner) │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
         │ [查看活动]                  │ [扫码/手动]
         │                             │
         ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│ /events          │          │ /scan/tickets/[id]│
│ /events/[id]     │          │ → /scan/confirm  │
│ /requests        │          └────────┬─────────┘
│ /staff           │                   │
└──────────────────┘                   │
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                    [核销成功]              [错误分支]│
                          │                         │
                          ▼                         ▼
                ┌──────────────────┐    ┌──────────────────┐
                │ /scan/success-1/2│    │ /scan/wrong-venue│
                └──────────────────┘    │ /scan/duplicate  │
                                        │ /scan/offline    │
                                        └──────────────────┘
```

#### 关键跳转规则

1. **未登录** → `/login`
2. **登录但无 membership** → `/onboarding/invite`
3. **有 membership 但无默认 workspace** → `/onboarding/select-workspace`
4. **有 workspace 但无默认 venue** → `/onboarding/select-venue`
5. **根据 role**：
   - `OWNER/MANAGER` → `/` (dashboard)
   - `STAFF` → `/scan`
6. **API 错误码路由**：
   - `UNAUTHORIZED` → `/login`
   - `NO_ACCESS` → `/no-access`
   - `NEED_SELECT_VENUE` → `/onboarding/select-venue`
   - `WRONG_VENUE` → `/scan/wrong-venue`
   - `DUPLICATE_REDEEM` → `/scan/duplicate`
   - `OFFLINE` → `/scan/offline`

---

### 📡 现有 API vs 所需 API

#### ✅ 已存在的 API

| API 路径 | 方法 | 功能 | 状态 |
|---------|------|------|------|
| `/api/dashboard` | GET | Dashboard 统计 | ✅ 已有 |
| `/api/events` | GET | 活动列表 | ✅ 已有 |
| `/api/events/[id]` | GET | 活动详情 | ✅ 已有 |
| `/api/me` | GET | 当前用户信息 | ✅ 已有 |
| `/api/requests` | GET/POST | 申请列表/创建 | ✅ 已有 |
| `/api/staff` | GET | 员工列表 | ✅ 已有 |
| `/api/staff/[memberId]` | GET | 员工详情 | ✅ 已有 |
| `/api/invites/redeem` | POST | 兑换邀请码 | ✅ 已有 |
| `/api/workspace/select` | POST | 选择 workspace | ✅ 已有 |
| `/api/tickets/search` | GET | 搜索票务 | ✅ 已有 |

#### ❌ 缺失的 API

| API 路径 | 方法 | 功能 | 优先级 |
|---------|------|------|--------|
| `/api/merchant/workspaces` | GET | 获取可访问的 workspace 列表 | 🔴 P0 |
| `/api/merchant/venues` | GET | 获取 venues（按 workspace） | 🔴 P0 |
| `/api/merchant/venues/select` | POST | 选择当前 venue | 🔴 P0 |
| `/api/merchant/events/[id]/stats` | GET | 活动统计（售票/核销） | 🟡 P1 |
| `/api/merchant/requests/new-event` | POST | 提交新建活动申请 | 🟡 P1 |
| `/api/merchant/requests/price-change` | POST | 提交价格变更申请 | 🟡 P1 |
| `/api/merchant/staff/invite` | POST | 生成员工邀请码 | 🟡 P1 |
| `/api/merchant/staff/[id]/status` | POST | 启用/禁用员工 | 🟡 P1 |
| `/api/merchant/staff/scan/lookup` | POST | 扫码/手动查询票务详情 | 🔴 P0 |
| `/api/merchant/staff/scan/confirm` | POST | 确认核销（含错误码） | 🔴 P0 |
| `/api/merchant/staff/scan/undo` | POST | 撤销核销（可选） | 🟢 P2 |
| `/api/merchant/settings/venue` | GET/PUT | 场地设置 | 🟢 P2 |

---

### 🎯 缺失页面统计

| 类别 | 缺失数量 | 已存在 | 需改造 |
|------|---------|--------|--------|
| AUTH/ONBOARDING | 3 | 4 | 3 |
| BOSS 端 | 7 | 3 | 1 |
| STAFF 端 | 9 | 1 | 0 |
| ERROR/LOADING | 3 | 0 | 0 |
| **总计** | **22** | **8** | **4** |

---

### 🔧 实现优先级

#### Phase 2: 核心架构（立即执行）
- [ ] 创建 `useMerchantContext()` hook
- [ ] 实现 workspace/venue 选择与持久化
- [ ] 统一 API 错误码处理与路由跳转
- [ ] 修复现有页面移动端样式

#### Phase 3: Onboarding（P0）
- [ ] `/onboarding/select-venue` (2步流程)
- [ ] `/onboarding/invite/invalid`
- [ ] `/error` 和 `/no-access`
- [ ] 补齐相关 API

#### Phase 4: Boss 端（P0-P1）
- [ ] `/events/[eventId]` (活动详情)
- [ ] `/requests` (申请中心)
- [ ] `/requests/new-event` 和 `/requests/price-change`
- [ ] `/staff/[staffId]`
- [ ] `/venue-switch` 和 `/settings/venue`

#### Phase 5: Staff 端（P0）
- [ ] `/scan/tickets/[ticketId]`
- [ ] `/scan/confirm`
- [ ] `/scan/manual-lookup`
- [ ] `/scan/success-1/2`
- [ ] `/scan/wrong-venue`, `/scan/duplicate`, `/scan/offline`
- [ ] 补齐核销 API 与错误码

#### Phase 6: 验收与修复
- [ ] 修复所有 TypeScript/ESLint 错误
- [ ] 移动端样式统一（禁用 desktop）
- [ ] 完整流程测试脚本
- [ ] 错误处理覆盖测试

---

## 下一步行动

**现在开始 Phase 2：创建 Merchant Context 和修复基础架构**
