# ✅ 数据库迁移成功完成

## 迁移执行时间
执行时间：刚刚完成

## 迁移内容
- **迁移文件**: `supabase/migrations/034_event_week_ticketing_v2.sql`
- **执行命令**: `npx supabase db push --include-all`

## 已创建的表
✅ `events_v2` - 活动长期模板
✅ `event_weeks` - 每周配置
✅ `event_week_days` - 每天配置
✅ `ticket_types_v2` - 每天独立票种
✅ `merchant_change_requests` - 商家修改申请

## 已创建的函数
✅ `rpc_get_or_create_event_week` - 获取或创建本周配置
✅ `calculate_day_validity_window` - 时间窗口计算

## 已扩展的表
✅ `tickets` - 添加快照字段（event_id_v2, event_week_id, event_week_day_id, ticket_type_id_v2, valid_start_at, valid_end_at, ticket_name_snapshot, price_paid_cents_snapshot 等）

## 已创建的 RLS 策略
✅ Admin: 完全读写权限
✅ Internal: 只读权限（自己 merchant）
✅ Customer: 只读权限（active/paused events）

## 下一步
现在可以开始测试新功能了！

1. **测试 Admin 功能**
   - 访问 `/events-v2` 创建新活动
   - 配置周（设置不同天的票价）
   - 保存并验证

2. **测试 Internal 功能**
   - 访问 `/events-v2` 查看活动列表
   - 查看活动详情
   - 提交修改申请

3. **测试 Customer 功能**
   - 访问 `/events-v2/[id]` 查看活动详情
   - 按天浏览票种
   - 测试 paused 状态
   - 完成购买流程

4. **测试 Admin 审批**
   - 访问 `/change-requests` 查看修改申请列表
   - 审批通过/拒绝申请
   - 验证 Stripe 同步

## 注意事项
- 所有新功能已就绪
- 旧系统（events, ticket_types）仍然可用，新旧并行
- 新创建的活动使用 v2 系统
- 确保 Stripe 环境变量已配置
