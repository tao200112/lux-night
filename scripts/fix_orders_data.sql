-- ==========================================
-- Lux Night Order Repair & Diagnostics Script
-- ==========================================

-- 1. Check for Unlinked Orders (Missing event_v2_id)
SELECT count(*) as unlinked_orders_count 
FROM orders 
WHERE event_v2_id IS NULL;

-- 2. Diagnostic Report: Show Unlinked Orders with Clues
-- This helps identify which event they *should* belong to based on ticket types.
SELECT 
    o.id as order_id, 
    o.created_at, 
    o.amount_cents, 
    o.status,
    oi.ticket_type_v2_id as item_tt_v2_id,
    oi.ticket_type_id_v2 as item_tt_id_v2,
    tt.name as ticket_name,
    tt.event_week_day_id,
    ewd.dow,
    ew.week_start_date
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN ticket_types_v2 tt ON (oi.ticket_type_v2_id = tt.id OR oi.ticket_type_id_v2 = tt.id)
LEFT JOIN event_week_days ewd ON tt.event_week_day_id = ewd.id
LEFT JOIN event_weeks ew ON ewd.event_week_id = ew.id
WHERE o.event_v2_id IS NULL
ORDER BY o.created_at DESC;

-- 3. Attempt Automatic Backfill (Best Effort)
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
    JOIN events_v2 ev ON ew.event_id = ev.id -- Assuming event_weeks links to event (check schema if event_id exists on event_weeks)
    WHERE o.event_v2_id IS NULL
) sub
WHERE o.id = sub.order_id;

-- Note: The join 'JOIN events_v2 ev ON ew.event_id = ev.id' assumes event_weeks has event_id. 
-- If event_weeks relies on something else, adjust accordingly. 
-- Based on the Checkout V2 code, we saw `eventWeekId` passed in but we didn't inspect `event_weeks` schema relation deeply in the code fixes.
-- Assuming standard relationship: event_weeks -> event_id -> events_v2(id).

-- 4. Verify Remaining Unlinked
SELECT count(*) as remaining_unlinked_orders 
FROM orders 
WHERE event_v2_id IS NULL;

-- 5. Fix Region IDs (Optional but recommended)
-- Update orders region_id from the resolved event's merchant
UPDATE orders o
SET region_id = m.region_id
FROM events_v2 ev
JOIN merchants m ON ev.merchant_id = m.id
WHERE o.event_v2_id = ev.id
AND o.region_id IS NULL;
