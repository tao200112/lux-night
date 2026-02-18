# Events Drag-and-Drop Sort — Scan Summary

## STEP 0 — CURRENT IMPLEMENTATION

### 1) Admin Event List
| Path | Purpose |
|------|---------|
| `apps/admin-web/app/events-v2/page.tsx` | Events list page: grid of cards, fetch from API |
| `apps/admin-web/app/api/admin/events-v2/route.ts` | GET events, POST create |

**Admin list structure**: Grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), each event is a card with poster, title, description, merchant, status badge, Configure link, status select.

**Admin query**: `order('created_at', { ascending: false })`

### 2) Customer Event Fetching
| Path | Purpose |
|------|---------|
| `apps/customer-web/lib/data/events.ts` | getEvents(), getEventsByRegion() |
| `apps/customer-web/app/page.tsx` | Discover page, calls getEventsByRegion(region.id) |

**Customer query**: `order('created_at', { ascending: false })`, filtered by `merchant.region_id`

### 3) Supabase Schema (events_v2)
- **034 migration**: events_v2 has: id, merchant_id, title, description, poster_url, status, created_at, updated_at
- **No sort_order** on events_v2
- ticket_types_v2 has sort_order (different table)

### 4) Realtime
- `apps/customer-web/hooks/useEventRealtime.ts` — subscribes to single event UPDATE (event detail page)
- `supabase_realtime` includes events_v2 (migration 20260217130000)

### 5) Event Type Shape (Admin)
```ts
interface EventV2 {
  id: string;
  title: string;
  description: string | null;
  poster_url: string;
  status: string;
  merchant: { id: string; name: string };
  created_at: string;
  updated_at: string;
}
```

---

## FILES TO MODIFY
- Migration: add sort_order
- Admin API: order by sort_order, add PATCH reorder
- Admin page: @dnd-kit sortable list
- Customer lib/data/events: order by sort_order
- Customer Discover: realtime refetch on events_v2 update
