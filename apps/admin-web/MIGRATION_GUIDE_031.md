# Quick Migration Guide: Fix Event Draft Without Venue

## ⚡ Quick Steps

This needs to be applied to your Supabase database **immediately** after code deployment.

### Option 1: Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Click "New Query"
3. Copy the entire content from `supabase/migrations/031_fix_event_draft_without_venue.sql`
4. Paste and click "Run"
5. Check output for success message:
   ```
   ✅ events.venue_id is now NULLABLE
   ✅ Event Draft Without Venue Fix Complete!
   ```

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push

# Or apply specific migration
supabase db push --include-migrations 031_fix_event_draft_without_venue.sql
```

### Option 3: Direct SQL (psql)

```bash
psql postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres \
  < supabase/migrations/031_fix_event_draft_without_venue.sql
```

---

## 🔍 Verification

After applying, verify it worked:

```sql
-- Check if venue_id is now nullable
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'events' 
  AND column_name = 'venue_id';

-- Expected: is_nullable = 'YES'
```

---

## 🧪 Test After Migration

### Test 1: Create Draft Without Venue

```bash
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "DRAFT",
  "title": "Test Draft Event",
  "start_at": "2026-02-01T22:00:00Z",
  "end_at": "2026-02-02T04:00:00Z",
  "venue_id": null
}

# Expected: 201 Created ✅
# If still getting 400: Migration not applied yet
```

### Test 2: Publish Without Venue (Should Fail)

```bash
POST /api/admin/merchants/{merchantId}/events
{
  "published_status": "PUBLISHED",
  "title": "Test Event",
  "start_at": "2026-02-01T22:00:00Z",
  "end_at": "2026-02-02T04:00:00Z",
  "venue_id": null,
  "ticket_types": [...]
}

# Expected: 400 Bad Request with code "MERCHANT_VENUE_NOT_BOUND" ✅
```

---

## ⚠️ Important Notes

1. **This migration is SAFE:**
   - Only relaxes constraint (does not delete data)
   - All existing events have venue_id populated
   - Can be rolled back easily if needed

2. **No downtime required:**
   - Can be applied while app is running
   - Only affects new event creation

3. **Existing triggers already support this:**
   - Migration 029 already created NULL-safe triggers
   - region_id will fall back to merchant.region_id

4. **If migration fails:**
   - Check if you have permission (need SUPERUSER or table owner)
   - Check if there are no active transactions blocking the ALTER TABLE
   - Try again after a few seconds

---

## 🆘 Troubleshooting

### Error: "permission denied"
**Solution:** Use a superuser account or database owner role

### Error: "relation 'events' does not exist"
**Solution:** Wrong database or schema - ensure you're connected to the correct Supabase project

### Migration applied but still getting 400
**Solution:** 
1. Restart Next.js server (clear connection pool)
2. Check Supabase logs for actual error
3. Verify using the SQL verification query above

---

## 📞 Support

If issues persist:
1. Check `apps/admin-web/EVENT_DRAFT_FIX_SUMMARY.md` for detailed info
2. Review Supabase edge logs
3. Check Next.js server console for error details
4. Verify merchant has region_id set (required for drafts without venue)
