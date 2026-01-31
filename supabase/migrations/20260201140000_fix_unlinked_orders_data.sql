-- ==========================================
-- Migration: Fix Unlinked Orders Data
-- ==========================================

-- 1. Attempt Automatic Backfill (Best Effort)
-- Strategy: If an order has items linked to ticket_types_v2, and those tickets belong to an event_week that belongs to an event_v2...
-- We can infer the event_v2_id.

UPDATE orders o
SET event_v2_id = sub.derived_event_id
FROM (
    SELECT DISTINCT ON (o.id)
        o.id as order_id,
        ev.id as derived_event_id
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN ticket_types_v2 tt ON (oi.ticket_type_v2_id = tt.id OR oi.ticket_type_id_v2 = tt.id)
    JOIN event_week_days ewd ON tt.event_week_day_id = ewd.id
    JOIN event_weeks ew ON ewd.event_week_id = ew.id
    JOIN events_v2 ev ON ew.event_id = ev.id
    WHERE o.event_v2_id IS NULL
) sub
WHERE o.id = sub.order_id;

-- 2. Fix Region IDs
-- Update orders region_id from the resolved event's merchant
UPDATE orders o
SET region_id = m.region_id
FROM events_v2 ev
JOIN merchants m ON ev.merchant_id = m.id
WHERE o.event_v2_id = ev.id
AND o.region_id IS NULL;
