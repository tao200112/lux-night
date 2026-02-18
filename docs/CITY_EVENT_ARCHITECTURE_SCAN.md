# City + Event Architecture — Project Scan

**Date**: 2026-02-17  
**Scope**: Database, TypeScript types, location/region logic, event fetch/filter, address display, admin, realtime.

---

## STEP 1 — CURRENT IMPLEMENTATION

### 1.1 Database Schema

#### Tables

| Table | Key columns | Notes |
|-------|-------------|-------|
| **regions** | id, name, state, country, lat, lng, slug, city, center_lat, center_lng, is_active | Geographic unit. No separate `cities` table. |
| **merchants** | id, region_id (FK), name, status, default_venue_id | Belongs to one region. |
| **venues** | id, merchant_id (FK), region_id (FK), name, address, lat, lng, place_id, formatted_address, address_line1/2, city, state, postal_code, country | Address and city live here. |
| **events_v2** | id, merchant_id (FK), title, description, poster_url, status, subtitle, venue_name, address | Display overrides. No explicit venue_id/region_id in 034. Public API may assume venue_id/region_id added elsewhere. |

#### City-related fields

- **regions.city** (TEXT, nullable) — Added in 20260126000000
- **venues.city** (TEXT) — Added in 20260126000000
- **events_v2** — No city. Address/venue come from merchant→venue or event display overrides.

#### Address-related fields

- **venues**: address, formatted_address, address_line1, address_line2, city, state, postal_code, country
- **events_v2**: venue_name, address (display overrides per 20260131140000)

---

### 1.2 Event Type (TypeScript)

**`EventWithVenue`** (lib/data/events.ts):

```ts
venue: { id, name, address, address_line1?, city?, state?, region_id?, lat?, lng? }
region?: { id, name, city?, state? }
```

- Event gets venue/region via merchant join.
- `region` holds area/city for filtering.
- `venue.city` / `region.city` can be used for city-level logic.

---

### 1.3 Location Logic

| Component | Logic |
|-----------|-------|
| **RegionContext** | `region: Region \| null`, `setRegion(regionId)`. Persists to localStorage `lux_region_id` and cookie via `/api/region/set`. |
| **Layout** | Reads `current_region_id` from cookies for SSR `initialRegion`. |
| **Discover page** | If `regions.length === 1` → auto `setRegion`. Events filtered by `region.id`. |
| **TopBar** | Shows region picker; slim header when single region. |
| **No geolocation** | No browser geolocation or reverse-geocode. |

---

### 1.4 Event Fetching & Filtering

| Source | Filter | Join path |
|--------|--------|-----------|
| **lib/data/events.ts** `getEvents(regionId?)` | `merchant.region_id = regionId` | events_v2 → merchants → venues, regions |
| **getEventsByRegion(regionId)** | Same as above | Used by Discover and Drops |
| **api/public/events-v2/[id]** | None (single event) | Expects events_v2.venue_id, events_v2.region_id FKs; venue/region may come from merchant/venue in practice |

Current model: filter by **region**, not by city string. Region ≈ area/city (e.g. Los Angeles, Blacksburg).

---

### 1.5 Address Display

| Page | Display |
|------|---------|
| **Discover (EventCard)** | `venue.name` or `venue.address`; no full address |
| **Event detail (events-v2/[id])** | `venue.name` only in header; no full address in layout |
| **Admin events-v2 week** | Venue Name, Address in Event Info tab |

Event page does not show full address; only venue name in a compact header.

---

### 1.6 Admin Panel

| Area | Fields |
|------|--------|
| **events-v2 PUT** | venue_name, venue_address (written to event and merchant’s default venue) |
| **Admin event GET** | Venue from merchant.default_venue_id |
| **Venues** | place_id, formatted_address, address_line1/2, city, state, postal_code, country |
| **Regions** | name, state, country, slug, city, center_lat, center_lng |

Admin uses venue/address fields; no dedicated city selector on events.

---

### 1.7 Realtime

- **Supabase config** has realtime.
- **Customer app** has no event subscription.
- **AuthContext** uses auth state listener only.

No realtime event updates in the customer UI.

---

## Weak Points

1. **Region vs city** — UI and filtering use region (ID); no first-class city notion.
2. **No geolocation** — Cannot auto-select city from user location.
3. **Event–venue link** — events_v2 has no explicit venue_id in migrations; venue comes via merchant.default_venue_id; public API may rely on additional columns.
4. **Address display** — Full address not shown on event page; only venue name.
5. **No realtime** — Event changes require refresh.
6. **Regions vs cities** — `regions` acts as both region and city; `region.name` and `region.city` can overlap.

---

## STEP 2 — Architecture Decision

- **No `cities` table** — Use existing `regions` as city/area.
- **Mapping** — `region.name` or `region.city` as “city” for filtering and display.
- **Filtering** — Keep `event.city === selectedCity` logic by deriving city from `region.name` or `region.city` (no schema change).
- **Avoid schema changes** where possible; add only if needed for performance or clarity.

---

## STEP 3 & 4 — Required Upgrades (Plan)

### A. City System

1. Add **CityContext** (alias/wrapper for RegionContext) or extend RegionContext:
   - `selectedCity` = `region.id` (keep using region as city).
   - Store in React state + localStorage (current behavior).
2. Add **CitySelector** bottom sheet (reuse Region picker modal).
3. If `regions.length === 1` → skip selection (already implemented).
4. Filter events by `merchant.region_id === selectedRegionId` (unchanged).

### B. Current Location Matching

1. Use `navigator.geolocation.getCurrentPosition`.
2. Compute distance to `regions` (center_lat, center_lng).
3. If within threshold → auto-select nearest region.
4. Else use `lastSelectedCity` from localStorage.
5. Else use first active region.

### C. Event Page Optimization

Display logic:

```
Venue Name
City, State
[View on Map]
```

- Full address in expandable section or map link only.
- Use `venue.city`, `venue.state` or `region.name`, `region.state`.
- Add small location icon.

### D. Realtime Subscription

1. `useEventRealtime(eventId)` hook.
2. `supabase.channel().on('postgres_changes', { table: 'events_v2', filter: `id=eq.${eventId}` })`.
3. On change → refresh event in state (no full reload).

### E. Minimal Code Changes

- Add CityContext (or extend RegionContext) with geolocation fallback.
- Add `useEventRealtime` hook.
- Update event page layout: Venue / City, State / [View on Map].
- Keep Stripe, checkout, and unrelated flows untouched.

---

*Scan complete. No code modified.*
