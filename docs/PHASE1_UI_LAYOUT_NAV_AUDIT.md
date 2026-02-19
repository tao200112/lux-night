# 商家端 UI / Layout / Bottom Nav / Request Changes 阶段 1 自检报告

**执行日期**: 2026-02-18  
**规则**: 阶段 1 仅做只读诊断，禁止修改代码

---

## 1) Findings

### A) 全局 UI 仍为手机适配：根因

#### 1) 根 Layout
- **路径**：`apps/internal-web/app/layout.tsx`
- **内容**：仅 `MerchantProvider` + `{children}`，无 Shell/PageContainer/BottomNav
- **结构**：`<div className="relative w-full min-h-screen">` 包住 children，无宽度约束

#### 2) 桌面端宽度是否被锁死
- **是**：在 `globals.css` 中锁死
- **证据**：`apps/internal-web/app/globals.css` **L14–21**
  ```css
  /* 移动端强制样式 - 390px 视口基准 */
  @media (min-width: 430px) {
    body {
      max-width: 430px;
      margin: 0 auto;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
    }
  }
  ```
- **结论**：视口 ≥430px 时，`body` 被强制 `max-width: 430px`，所有页面在桌面端都被限制在手机宽度。

#### 3) 命中路径与行号

| 模式 | 路径 | 行号 |
|------|------|------|
| `max-w-[430px]` | dashboard/page.tsx | 114, 272 |
| | events/page.tsx | 106, 342 |
| | settings/page.tsx | 50, 126 |
| | staff/page.tsx | 249 |
| | admin/event-change-requests | 131, 139, 152 |
| | staff/[memberId] | 135, 143, 180 |
| | inventory-change | 139 |
| | price-change | 140 |
| | invite | 102 |
| | scan | 36 |
| | workspaces | 268 |
| `max-w-7xl` | events-v2/page.tsx | 57, 67, 82 |
| | events-v2/[id]/page.tsx | 84, 94, 109 |
| | events-v2/[id]/request-change | 207, 217, 232 |
| `max-w-md` | staff/page.tsx | 129, 203 |
| `min-h-screen` | 多处 | 多页 |
| `mx-auto` | 多处 | 与 max-w 配合 |
| `px-4` / `px-6` | 多处 | 常规 padding |
| `md:` / `lg:` | events-v2/page.tsx | 95（仅 grid 使用 `md:grid-cols-2 lg:grid-cols-3`） |
| `useMediaQuery` / `isMobile` / `innerWidth` | 无 | 无命中 |

#### 4) 结论：为何桌面端未启用 desktop layout
- **直接根因**：`globals.css` 中 `@media (min-width: 430px)` 对 `body` 设置 `max-width: 430px`，导致整站被锁在手机宽度。
- **布局原因**：未做响应式分叉，没有 `lg:` 下的桌面布局。
- **参考**：admin-web 使用 `(admin)/layout.tsx`，有 `lg:flex-row`、`lg:pb-6`、Sidebar + BottomNav 的 lg 响应式；merchant portal 无类似结构。

---

### B) 底部导航栏切换不稳定

#### 1) BottomNav 定义与使用
- **无** 独立 `BottomNav` 组件。
- **实现方式**：各页面内联 `<nav className="fixed bottom-0 ...">`。

#### 2) 使用位置（路径+行号）

| 页面 | 路径 | 行号 | 说明 |
|------|------|------|------|
| dashboard | dashboard/page.tsx | 272-298 | 含 Dashboard/Events/Scan/Staff/Settings |
| events | events/page.tsx | 342-368 | 相同结构 |
| settings | settings/page.tsx | 126-152 | 相同结构 |
| staff | staff/page.tsx | 249-260 | 仅 CTA 按钮，非完整 5 项 nav |
| request-change | events-v2/[id]/request-change | 无 | 无 BottomNav |
| events-v2 列表/详情 | events-v2/* | 无 | 无 BottomNav |

#### 3) 是否放在 layout
- **否**。根 `layout.tsx` 无 BottomNav，未使用 `(merchant)/layout.tsx`。
- **结果**：Nav 写在各个 page 内部。

#### 4) 是否存在两套导航
- **是**：同一套导航在不同页面各自实现，非共用组件。
- dashboard、events、settings 结构类似；staff 不同（只有 CTA）。

#### 5) template / route group 导致的 remount
- **无** `template.tsx`。
- **无** `(merchant)` route group，仅根 layout。
- **路由结构**：扁平，无 route group 切换。

#### 6) 切换页面时 Bottom Nav 不稳定的原因
- **根因**：Bottom Nav 在 page 内，不在 layout。
- **表现**：路由切换时，整个 page（含 nav）unmount，新 page（含 nav）mount。
- **证据**：dashboard L272 `<nav>` 在 return 中；events L342 同理。Next.js App Router 下，`/dashboard` → `/events` 会卸载 dashboard 树并挂载 events 树，两处 nav 为不同实例。
- **结论**：每次切换都会 remount nav，产生闪烁/抖动，且部分页面（events-v2、request-change）无 nav。

---

### C) Request Changes 页面明细 Bug（图 3）

#### 1) 页面组件
- **路径**：`apps/internal-web/app/events-v2/[id]/request-change/page.tsx`
- **根容器**：L231 `className="min-h-screen bg-background-dark text-white"`
- **内容区**：L232 `className="max-w-7xl mx-auto px-4 py-8"`（受 globals.css 约束，实际宽度被 body 430px 限制）

#### 2) 造成溢出的具体容器

| 元素 | 行号 | 类名 / 结构 | 问题 |
|------|------|-------------|------|
| 时间行 | 303 | `grid grid-cols-3 gap-4` | 固定 3 列，窄屏下每列过窄；无 `min-w-0`，可能溢出 |
| 票种行 | 337-378 | `flex items-center gap-4` | 4 子项：input flex-1、select、input w-24、button；flex 子默认 `min-width: auto`，不会收缩 |
| select | 351 | `px-3 py-1 ...` 无 min-w-0 | 有 intrinsic min-width，易撑开父级 |
| input price | 364 | `w-24` | 96px 固定宽度 |
| Delete 按钮 | 374 | 无 flex-shrink-0 | 可能在窄屏被挤出视口 |

#### 3) 导致横向滚动的元素与证据
- **主要来源**：L337 `className="bg-surface-light rounded p-3 flex items-center gap-4"` 的票种行。
- **CSS 原因**：`flex` 子项默认 `min-width: auto`，会按内容保持最小宽度；`flex-1` 的 input 会抢空间，但 select、w-24 input、Delete 不收缩，总宽度易超过容器。
- **容器**：L232 `max-w-7xl mx-auto px-4` 无 `overflow-x-auto` 或 `min-w-0`，溢出会直接作用到 body，出现整页横向滚动。
- **结论**：票种行的 flex 布局 + 缺少 `min-w-0`/`flex-shrink` 和响应式换行，是 Delete 被挤出、出现横向溢出的直接原因。

---

## 2) Root Cause

- **A) 桌面宽度**：`globals.css` 在 `@media (min-width: 430px)` 中对 body 设置 `max-width: 430px`，且未在 layout 中区分 lg 断点，导致桌面端始终为手机宽度。
- **B) Bottom Nav 不稳定**：Bottom Nav 写在各个 page 内而非 layout，每次路由切换都会随 page 一起 unmount/remount，导致闪烁和抖动。
- **C) Request Changes 溢出**：票种行使用 `flex` 且子项无 `min-w-0`/响应式处理，select、固定宽度 input 和 Delete 按钮在窄屏下撑破容器，造成横向滚动和 Delete 跑出屏幕。

---

## 3) Proposed Standard

- **Desktop（≥1024px）**
  - 左侧 sidebar 或顶部 header + 主内容区（`max-w-6xl` 或 `max-w-7xl` 居中）
  - 仅 mobile 显示 bottom nav；desktop 用 sidebar 或顶部 tab 导航
- **Mobile**
  - Bottom nav 固定在 `layout.tsx`（`position: fixed`），跨页面不 remount
  - 主内容区底部留安全间距 `pb-20` 或 `pb-24`，避免被 nav 遮挡
- **PageContainer**
  - 统一：`max-w-6xl lg:max-w-7xl mx-auto px-4 md:px-6`
  - 移动优先页可额外使用 `max-w-[430px]`，需配合 `lg:max-w-6xl` 覆盖
- **globals.css**
  - 移除或调整 body 的 `max-width: 430px`，仅对特定移动页面生效，或改为 `lg:` 断点下恢复全宽

---

## 4) Acceptance Criteria

1. **Desktop（≥1024px）**
   - 页面不再被锁在 430px，容器宽度与 Proposed Standard 一致
   - Bottom nav 不显示（或改为 sidebar / 顶部 tabs）

2. **Mobile**
   - Bottom nav 在所有需导航的页面稳定存在，不闪、不跳、不重建
   - 切换页面不丢失 nav 状态
   - 内容滚动到底时，最后按钮仍可见，不被 nav 遮挡

3. **Request Changes 页面**
   - 无整页横向滚动
   - 每行输入/按钮在手机屏幕内自适应换行或折叠
   - Delete 按钮始终可见
   - “Add Ticket / Enabled / 时间选择”在窄屏下布局合理（stack 或单列）

4. **Console / Network**
   - 页面切换无 layout 相关报错
   - 无明显 UI 抖动或 remount 闪烁

---

## 5) Fix Plan

| 序号 | 模块 | 拟改文件 | 改动要点 | 风险 |
|------|------|----------|----------|------|
| 1 | Bottom Nav 固定 | `app/layout.tsx` 或新建 `(merchant)/layout.tsx` | 将 Bottom Nav 抽成组件，放入 layout；仅 mobile 渲染 | 需确认需要 nav 的路由列表；部分页面（如 request-change）是否展示 nav |
| 2 | 各 page | dashboard, events, settings, staff | 删除 page 内 nav 副本，依赖 layout 的 nav | 可能影响有条件 nav（如 dashboard 的 userRole） |
| 3 | Desktop 布局 | `globals.css` | 调整/移除 body `max-width: 430px`；或加 `@media (min-width: 1024px) { body { max-width: none } }` | 可能影响当前“手机优先”设计 |
| 4 | Desktop 布局 | `layout.tsx` | 增加 lg 断点：lg 下 sidebar，非 lg 下 bottom nav | 需与 admin 的 layout 风格对齐 |
| 5 | PageContainer | 新建 `PageContainer` | 统一 padding 与 max-width | 低 |
| 6 | Request Changes | `request-change/page.tsx` | 票种行：`flex flex-wrap` 或 `grid`；子项 `min-w-0`；时间行 `grid-cols-1 sm:grid-cols-3`；表单加 `overflow-x-hidden` 或 `min-w-0` | 低 |

**建议执行顺序**：1 → 2 → 3 → 4 → 5 → 6，对应 3 个 commits：
- Commit 1：Bottom Nav 固定到 layout
- Commit 2：Desktop layout 与 globals.css 调整
- Commit 3：Request Changes 布局修复

---

*阶段 1 结束。等待「OK，开始修复」后进入阶段 2。*
