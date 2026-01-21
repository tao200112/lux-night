# uimerchant UI 对接状态

## 📊 UI 设计文件清单 (29 个页面)

### ✅ Auth & Onboarding (已实现)
- [x] `internal_login` - 登录页面
- [x] `invite_code_gate` - 邀请码输入
- [x] `invite_gate__invalid_error` - 邀请码错误
- [x] `join_merchant_confirmation` - 确认加入
- [x] `select_workspace` - 选择 workspace
- [x] `role_routing_&_venue_select_1` - 角色路由/场地选择 1
- [x] `role_routing_&_venue_select_2` - 角色路由/场地选择 2

### 🔨 Merchant Pages (需要对接)
- [ ] `merchant_dashboard` - 商家主页（**当前优先**）
- [ ] `dashboard__loading_state` - Dashboard 加载状态
- [ ] `merchant__event_list` - 活动列表
- [ ] `merchant__event_detail` - 活动详情

### 🔨 Staff Pages (需要对接)
- [ ] `staff__ticket_scanner` - 扫码核销（**高优先级**）
- [ ] `staff__scan_success_1` - 核销成功 1
- [ ] `staff__scan_success_2` - 核销成功 2
- [ ] `staff__confirm_check-in` - 确认核销
- [ ] `staff__ticket_details` - 票务详情
- [ ] `staff__manual_lookup` - 手动查询
- [ ] `staff_scan__offline_state` - 离线状态
- [ ] `scan__duplicate_warning` - 重复核销警告
- [ ] `scan__wrong_venue_error` - 场地错误

### 🔨 Staff Management (需要对接)
- [ ] `staff_management_list` - 员工列表
- [ ] `staff_member_detail` - 员工详情

### 🔨 Request Center (需要对接)
- [ ] `request_center_list` - 申请中心列表
- [ ] `new_event_request` - 新建活动申请
- [ ] `price_change_request` - 改价申请

### 🔨 System Pages (需要对接)
- [ ] `system__error_&_retry` - 错误与重试
- [ ] `system__no_access` - 无权限
- [ ] `venue_quick_switch` - 快速切换场地
- [ ] `venue_settings` - 场地设置

---

## 🎨 设计系统规范

### Colors
```typescript
{
  primary: "#006666",           // 主色（深青色）
  "background-light": "#ffffff",
  "background-dark": "#1a1d23",
  "card-light": "#F5F7F9",
  "card-dark": "#252932",
}
```

### Typography
- **Font**: Lexend (Google Fonts)
- **Weights**: 300, 400, 500, 600, 700
- **Antialiasing**: `-webkit-font-smoothing: antialiased`

### Icons
- **Material Symbols Outlined**
- **Settings**: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`

### Border Radius
```typescript
{
  DEFAULT: "0.25rem",  // 4px
  lg: "0.5rem",        // 8px
  xl: "0.75rem",       // 12px
  full: "9999px",      // 圆形
}
```

---

## 🚀 下一步行动

### 立即修复
1. ✅ 修复 dashboard.ts 编码问题（已完成）
2. ✅ 清理缓存（已完成）
3. 🔄 重启 dev server（进行中）
4. ⏳ 测试 dashboard 页面是否正常加载

### 后续优化
1. 对接 `merchant_dashboard` UI 设计
2. 实现 `staff__ticket_scanner` 扫码页面
3. 实现 Staff Management 页面
4. 实现 Request Center 页面

---

## 📝 UI 对接注意事项

1. **严格遵循 uimerchant 设计**：不要自由发挥，完全按照 HTML 设计实现
2. **颜色系统**：使用 `#006666` 作为主色，不是 `#c8ab5f`（金色）
3. **字体**：Lexend，不是其他字体
4. **图标**：Material Symbols Outlined，不是其他图标库
5. **布局**：参考 HTML 的 class 和结构

---

## 🐛 当前问题

### 已修复
- ✅ `dashboard.ts` UTF-16 编码问题

### 待确认
- ⏳ Dev server 重启后是否正常
- ⏳ Dashboard 页面是否能正常加载
