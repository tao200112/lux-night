-- ============================================================
-- 清空全部测试数据 SQL 脚本
-- 警告：此操作不可逆！请确保在测试环境执行
-- 生成时间：2026-01-26
-- ============================================================

-- 关闭触发器以避免级联问题
SET session_replication_role = replica;

-- ============================================================
-- 1. 清空订单相关（最底层，先删）
-- ============================================================

-- 票据核销记录
TRUNCATE TABLE public.ticket_redemptions CASCADE;

-- 票据
TRUNCATE TABLE public.tickets CASCADE;

-- 订单项
TRUNCATE TABLE public.order_items CASCADE;

-- 订单
TRUNCATE TABLE public.orders CASCADE;

-- ============================================================
-- 2. 清空活动相关
-- ============================================================

-- 票种（ticket_types）
TRUNCATE TABLE public.ticket_types CASCADE;

-- 活动
TRUNCATE TABLE public.events CASCADE;

-- ============================================================
-- 3. 清空场地相关
-- ============================================================

-- 场地
TRUNCATE TABLE public.venues CASCADE;

-- ============================================================
-- 4. 清空商家/成员相关
-- ============================================================

-- 商家成员关系
TRUNCATE TABLE public.merchant_members CASCADE;

-- 邀请码
TRUNCATE TABLE public.invites CASCADE;

-- 商家
TRUNCATE TABLE public.merchants CASCADE;

-- ============================================================
-- 5. 清空地区
-- ============================================================

-- 地区
TRUNCATE TABLE public.regions CASCADE;

-- ============================================================
-- 6. 重置 profiles 中的关联字段（不删除用户）
-- ============================================================

UPDATE public.profiles 
SET 
  last_region_id = NULL,
  default_merchant_id = NULL,
  default_venue_id = NULL
WHERE last_region_id IS NOT NULL 
   OR default_merchant_id IS NOT NULL 
   OR default_venue_id IS NOT NULL;

-- 恢复触发器
SET session_replication_role = DEFAULT;

-- ============================================================
-- 7. 验证清空结果
-- ============================================================

SELECT 'regions' AS table_name, COUNT(*) AS count FROM public.regions
UNION ALL SELECT 'merchants', COUNT(*) FROM public.merchants
UNION ALL SELECT 'venues', COUNT(*) FROM public.venues
UNION ALL SELECT 'events', COUNT(*) FROM public.events
UNION ALL SELECT 'ticket_types', COUNT(*) FROM public.ticket_types
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'tickets', COUNT(*) FROM public.tickets
UNION ALL SELECT 'invites', COUNT(*) FROM public.invites
UNION ALL SELECT 'merchant_members', COUNT(*) FROM public.merchant_members;

-- ============================================================
-- 完成！所有数据已清空，可以开始重新测试
-- ============================================================
