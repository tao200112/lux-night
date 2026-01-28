# 修复入口链接 - 将旧路由改为新路由

## 问题
所有入口链接仍指向旧路由 `/events/*`，导致用户看到的仍是包含 Venue/Time/Weekly 的旧页面。

## 已修复的入口点

### ✅ 1. 活动详情页的"编辑"按钮
- **文件**：`apps/admin-web/app/events/[id]/page.tsx`
- **行 332**：已从 `/events/${event.id}/edit` 改为 `/events-v2/${event.id}/week`
- **按钮文字**：从 "Edit Event" 改为 "Configure Week"

### ✅ 2. 活动列表页的"创建活动"按钮
- **文件**：`apps/admin-web/app/events/page.tsx`
- **行 203**：已从 `/events/new` 改为 `/events-v2/new`

### ✅ 3. Merchant 详情页的"创建活动"按钮
- **文件**：`apps/admin-web/app/merchants/[merchantId]/page.tsx`
- **行 225**：已从 `/events/new?merchant_id=${merchantId}` 改为 `/events-v2/new?merchant_id=${merchantId}`

## 已添加的 Console.log 标记

### 新页面标记
- ✅ `apps/admin-web/app/events-v2/[id]/week/page.tsx` - `[NEW V2 PAGE] AdminEventWeekPage loaded`
- ✅ `apps/admin-web/app/events-v2/new/page.tsx` - `[NEW V2 PAGE] AdminNewEventV2Page loaded`

### 旧页面标记
- ✅ `apps/admin-web/app/events/[id]/edit/page.tsx` - `[OLD PAGE] AdminEditEventPageContent loaded`
- ✅ `apps/admin-web/app/events/new/page.tsx` - `[OLD PAGE] AdminCreateEventPageContent loaded`

## 验证步骤

1. 运行开发环境
2. 点击"修改活动"按钮
3. 查看浏览器控制台：
   - 如果看到 `[NEW V2 PAGE]` → 新页面已生效 ✅
   - 如果看到 `[OLD PAGE]` → 仍有入口链接未修复 ❌

## 剩余需要检查的入口点

### 可能存在的其他入口
1. **导航栏组件**（如果存在）
   - 检查是否有全局导航栏
   - 查找所有指向 `/events/*` 的链接

2. **面包屑导航**
   - 检查是否有面包屑组件
   - 确保指向新路由

3. **其他列表页**
   - 检查是否有其他页面显示活动列表
   - 确保编辑链接指向新路由

## 下一步

如果控制台仍显示 `[OLD PAGE]`，需要：
1. 检查浏览器缓存（硬刷新 Ctrl+Shift+R）
2. 检查是否有其他入口链接未修复
3. 检查路由中间件是否重定向
