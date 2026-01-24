-- ============================================
-- 查询不一致数据：orders 已 paid/fulfilled 但 tickets=0
-- ============================================

-- 1. 查询 orders 已 paid/fulfilled 但 tickets=0 的订单
SELECT 
  o.id AS order_id,
  o.user_id,
  o.status AS order_status,
  o.amount_cents,
  o.created_at AS order_created_at,
  o.stripe_payment_intent_id,
  o.stripe_customer_id,
  COUNT(t.id) AS ticket_count,
  STRING_AGG(DISTINCT oi.ticket_type_id::text, ', ') AS ticket_type_ids,
  STRING_AGG(DISTINCT oi.quantity::text, ', ') AS quantities
FROM orders o
LEFT JOIN tickets t ON t.order_id = o.id
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.status IN ('paid', 'fulfilled')
GROUP BY o.id, o.user_id, o.status, o.amount_cents, o.created_at, o.stripe_payment_intent_id, o.stripe_customer_id
HAVING COUNT(t.id) = 0
ORDER BY o.created_at DESC;

-- ============================================
-- 查询 sold_count 可能不一致的 ticket_types
-- (sold_count 应该等于该类型已生成的 tickets 数量，排除 refunded)
-- ============================================

-- 2. 查询 sold_count 与实际 tickets 数量不一致的 ticket_types
SELECT 
  tt.id AS ticket_type_id,
  tt.name AS ticket_type_name,
  tt.event_id,
  tt.sold_count AS reported_sold_count,
  COUNT(t.id) AS actual_ticket_count,
  (tt.sold_count - COUNT(t.id)) AS discrepancy,
  CASE 
    WHEN tt.sold_count > COUNT(t.id) THEN 'sold_count too high'
    WHEN tt.sold_count < COUNT(t.id) THEN 'sold_count too low'
    ELSE 'match'
  END AS issue_type
FROM ticket_types tt
LEFT JOIN tickets t ON t.ticket_type_id = tt.id AND t.status != 'refunded'
GROUP BY tt.id, tt.name, tt.event_id, tt.sold_count
HAVING tt.sold_count != COUNT(t.id)
ORDER BY ABS(tt.sold_count - COUNT(t.id)) DESC;

-- ============================================
-- 校正 sold_count 的 SQL（谨慎使用）
-- ============================================

-- 3. 校正 ticket_types.sold_count 为实际 tickets 数量
-- 警告：仅在确认需要校正时使用，建议先备份数据
/*
UPDATE ticket_types tt
SET 
  sold_count = COALESCE((
    SELECT COUNT(*)
    FROM tickets t
    WHERE t.ticket_type_id = tt.id
      AND t.status != 'refunded'
  ), 0),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM tickets t
  WHERE t.ticket_type_id = tt.id
);
*/

-- ============================================
-- 查询特定订单的详细信息（用于调试）
-- ============================================

-- 4. 查询特定订单的完整信息（替换 ORDER_ID_HERE）
/*
SELECT 
  o.id AS order_id,
  o.user_id,
  o.status AS order_status,
  o.amount_cents,
  o.stripe_payment_intent_id,
  o.created_at AS order_created_at,
  oi.id AS order_item_id,
  oi.ticket_type_id,
  oi.quantity,
  oi.unit_price_cents,
  COUNT(t.id) AS ticket_count,
  STRING_AGG(t.id::text, ', ') AS ticket_ids
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN tickets t ON t.order_id = o.id AND t.ticket_type_id = oi.ticket_type_id
WHERE o.id = 'ORDER_ID_HERE'
GROUP BY o.id, o.user_id, o.status, o.amount_cents, o.stripe_payment_intent_id, o.created_at, oi.id, oi.ticket_type_id, oi.quantity, oi.unit_price_cents
ORDER BY oi.id;
*/
