# 部署检查清单

## ✅ API 路由分离检查

### Customer Web API 路由 (`apps/customer-web/app/api/`)
- ✅ `/api/regions` - 区域查询
- ✅ `/api/profile/region` - 用户区域更新
- ✅ `/api/tickets/[id]/redeem` - 票据兑换
- ✅ `/api/checkout/create-session` - 创建支付会话
- ✅ `/api/stripe/webhook` - Stripe Webhook

### Internal Web API 路由 (`apps/internal-web/app/api/`)
- ✅ `/api/me` - 获取当前用户信息
- ✅ `/api/invites/redeem` - 兑换邀请码
- ✅ `/api/invites/create` - 创建邀请码
- ✅ `/api/workspace/select` - 选择工作空间
- ✅ `/api/checkins` - 核销票据
- ✅ `/api/tickets/search` - 搜索票据
- ✅ `/api/dashboard` - 仪表盘数据
- ✅ `/api/events` - 活动列表
- ✅ `/api/events/[id]` - 活动详情
- ✅ `/api/staff` - 员工列表
- ✅ `/api/staff/[memberId]` - 更新员工状态
- ✅ `/api/requests` - 申请列表/创建
- ✅ `/api/requests/[id]` - 申请详情
- ✅ `/api/admin/requests/[id]/approve` - 审批申请
- ✅ `/api/admin/requests/[id]/reject` - 拒绝申请

## ✅ 已修复的问题

1. ✅ Internal Web API 路径已从 `/api/internal/*` 移动到 `/api/*`
2. ✅ 前端页面 API 调用路径已更新（移除 `/internal/` 前缀）
3. ✅ 前端页面路由路径已修复（移除 `/internal/` 前缀）
4. ✅ API 注释路径已更新
5. ✅ 构建缓存已清理
6. ✅ 无跨应用 API 引用

## 📋 部署前检查

- [x] API 路由已正确分离
- [x] 前端 API 调用路径正确
- [x] 前端路由路径正确
- [x] 构建缓存已清理
- [x] 环境变量文件已创建
- [ ] 环境变量已填入实际值（需要手动配置）
- [ ] Supabase Redirect URLs 已配置（需要手动配置）

## 🚀 部署命令

### 启动 Customer Web (端口 3000)
```cmd
npx -y pnpm@latest dev:customer
```

### 启动 Internal Web (端口 3001)
```cmd
npx -y pnpm@latest dev:internal
```

## ⚠️ 注意事项

1. **环境变量**: 确保 `.env.local` 文件已填入实际的 Supabase 配置
2. **Supabase Redirect URLs**: 在 Supabase Dashboard 配置回调 URL
3. **端口冲突**: 如果端口被占用，先停止占用进程
