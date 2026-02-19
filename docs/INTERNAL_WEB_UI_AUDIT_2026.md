# Internal Web (Merchant Portal) 系统检查报告

**执行日期**: 2026-02-18  
**检查范围**: 全屏、桌面布局、底部导航栏、页面宽度

---

## 一、问题清单

### 问题 1：全屏 Web 组件栏消失 / 顶部栏不完整

**现象**：全屏模式下顶部组件栏（header/top bar）可能不显示或未全宽铺满。

**检查结果**：

| 项目 | 现状 | 证据 |
|-----|------|------|
| 全局 Top Bar | **无** | `layout.tsx` 只有 MerchantProvider + MerchantShell，无全局顶栏 |
| 各页 Header | 每页独立 | 每页在各自 `max-w-[430px]` 容器内定义 header |
| 桌面端顶栏 | **受 430px 限制** | header 在 max-w-[430px] 内，桌面端顶栏仍为 430px 宽，未全屏 |

**根因**：
- 没有统一的全局顶部栏组件
- 各页 header 写在 `max-w-[430px]` 容器内，桌面端也被限制在 430px
- 桌面端缺少全宽顶栏（如 admin-web 的 TopBar）

---

### 问题 2：页面未全屏，依旧手机页面显示

**现象**：在桌面浏览器中，内容仍按手机宽度显示（约 430px），未铺满屏幕。

**检查结果**：

| 文件 | 行号 | 容器类名 | 影响 |
|-----|------|----------|------|
| globals.css | 15-21 | `@media (min-width:430px) and (max-width:1023px) { body max-width:430px }` | 430–1023px 时 body 被限制 |
| dashboard/page.tsx | 114 | `max-w-[430px] mx-auto` | 所有断点均 430px |
| events/page.tsx | 106 | `max-w-[430px] mx-auto` | 同上 |
| settings/page.tsx | 50 | `max-w-[430px] mx-auto` | 同上 |
| staff/page.tsx | 113 | `max-w-[430px] mx-auto` | 同上 |
| scan/page.tsx | 36 | `max-w-[430px] mx-auto` | 同上 |
| workspaces/page.tsx | 268 | `max-w-[430px] mx-auto` | 同上 |
| requests/page.tsx | 107 | `max-w-[430px] mx-auto` | 同上 |
| inventory-change, price-change | 139-140 | `max-w-[430px] mx-auto` | 同上 |
| admin/event-change-requests | 152 | `max-w-[430px] mx-auto` | 同上 |
| 其他 15+ 页面 | 多处 | `max-w-[430px] mx-auto` | 同上 |

**例外**（使用 max-w-7xl，桌面可展开）：
- events/[id]/page.tsx：`max-w-7xl mx-auto`
- events/[id]/request-change/page.tsx：`max-w-7xl mx-auto`

**根因**：
1. 绝大多数页面根容器使用 `max-w-[430px]`，且无 `lg:` 覆盖
2. 页面级限制优先级高于 body，桌面端依然被锁在 430px
3. 未按断点区分：移动端 430px，桌面端 6xl/7xl

---

### 问题 3：底部导航栏不对齐，图标和文字有偏移

**现象**：底部导航图标与文字未垂直对齐，存在视觉偏移。

**检查结果**：

| 项目 | 现状 | 可能原因 |
|-----|------|----------|
| 图标容器 | `w-10 h-10 flex items-center justify-center` | 尺寸统一 |
| Material Symbols | `material-symbols-outlined` + `text-2xl` | 图标字体 baseline/line-height 与容器不一致 |
| 文字 | `text-[10px] font-bold` | 与图标垂直间距/对齐 |
| Scan 按钮 | 圆形容器 + 内嵌 icon | 结构与其他项不同，易产生对齐差异 |
| Events 图标 | `text-2xl filled`（激活时） | 尺寸/粗细与默认不同 |
| gap | `gap-1` | 图标与文字间距较小，对齐问题更明显 |

**根因分析**：
1. **Material Symbols** 字体有固有 line-height，可能与 flex 容器垂直居中不完全一致
2. **尺寸不一**：默认 24px vs `text-2xl`（约 24px）vs `filled` 粗细变化，造成视觉不齐
3. **Scan 按钮**：`rounded-full` + 嵌套 `span`，布局与其他 `navItem` 不同
4. **文字基线**：`text-[10px]` 与图标底部对齐依赖 gap，易受字体渲染影响

---

## 二、解决方案

### 方案 1：全屏顶栏与布局结构

**建议**：
1. 新增 `MerchantTopBar` 组件，在 layout 中置于 `MerchantShell` 之上
2. 顶栏使用 `w-full`，不放在 `max-w-[430px]` 内
3. 桌面端：顶栏全宽；内容区使用 `max-w-6xl lg:max-w-7xl mx-auto`
4. 移动端：顶栏与内容区同宽（如 430px 或 100%）

**涉及文件**：
- 新建 `components/MerchantTopBar.tsx`
- 修改 `app/layout.tsx`：引入 TopBar，调整结构
- 修改 `MerchantShell.tsx`：顶栏与内容区布局配合

---

### 方案 2：桌面全屏与响应式宽度

**建议**：
1. **globals.css**：保持现有 `430px–1023px` 的 body 限制；确保 `≥1024px` 时 body 无 max-width
2. **页面容器**：统一使用响应式 max-width
   - 移动优先：`w-full max-w-[430px] lg:max-w-6xl xl:max-w-7xl mx-auto`
   - 或新建 `PageContainer` 封装上述逻辑
3. **批量替换**：将各页面的 `max-w-[430px]` 改为 `max-w-[430px] lg:max-w-6xl`（或通过 PageContainer）

**涉及文件**：
- `app/globals.css`（确认 1024px+ 无限制）
- 所有含 `max-w-[430px]` 的页面（约 25 处）
- 可选：新建 `components/PageContainer.tsx`

---

### 方案 3：底部导航栏对齐

**建议**：
1. **统一图标尺寸**：全部使用 `text-2xl`，避免混用默认与 text-2xl
2. **图标垂直居中**：
   - 为图标 span 增加 `inline-flex items-center justify-center`
   - 或使用 `leading-none` 减少 line-height 影响
3. **Scan 按钮结构**：与 navItem 保持一致
   - 外层：`flex flex-col items-center justify-center gap-1`
   - 图标容器：与 navItem 相同的 `w-10 h-10` 圆角或圆形
4. **文字对齐**：
   - 为文字加 `block` 或 `inline-block`，保证水平居中
   - 必要时用 `min-h` 固定文字行高，减少跳动

**涉及文件**：
- `components/MerchantBottomNav.tsx`

**示例修改**（示意）：
```tsx
// 图标容器统一
<span className="inline-flex items-center justify-center w-10 h-10 shrink-0 leading-none">
  <span className="material-symbols-outlined text-2xl">...</span>
</span>
// 文字
<span className="block text-[10px] font-bold text-center leading-tight">...</span>
```

---

## 三、修复优先级与顺序

| 优先级 | 问题 | 改动范围 | 建议顺序 |
|-------|------|----------|----------|
| P0 | 底部导航对齐 | 1 个组件 | 1 |
| P1 | 桌面全屏布局 | 多页 + globals.css | 2 |
| P2 | 全屏顶栏 | layout + 新组件 | 3 |

---

## 四、验收标准

1. **底部导航**：图标与文字垂直对齐，五个 tab 视觉一致，无偏移
2. **桌面 (≥1024px)**：主内容区宽度约 6xl/7xl，不再锁在 430px
3. **顶栏**：桌面端顶栏全宽，移动端与内容区协调
4. **移动端**：保持 430px 居中布局，底部导航不遮挡内容
