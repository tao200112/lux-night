-- Migration: Add Ambassadors and Invites
-- Created at: 2026-02-01
-- Description: Adds tables for ambassadors, invites, and updates orders table.

-- 1. Create ambassadors table
CREATE TABLE IF NOT EXISTS ambassadors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'banned')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create ambassador_invites table
CREATE TABLE IF NOT EXISTS ambassador_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE, -- Application should ensure upper(trim(code))
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    max_uses INT NULL CHECK (max_uses IS NULL OR max_uses > 0),
    uses_count INT NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS merchant_id UUID NULL REFERENCES merchants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS invite_code TEXT NULL,
ADD COLUMN IF NOT EXISTS invite_id UUID NULL REFERENCES ambassador_invites(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ambassador_id UUID NULL REFERENCES ambassadors(id) ON DELETE SET NULL;

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_ambassadors_merchant_id ON ambassadors(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_invites_merchant_id ON ambassador_invites(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_invites_ambassador_id ON ambassador_invites(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_invites_code ON ambassador_invites(code);

CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_invite_id ON orders(invite_id);
CREATE INDEX IF NOT EXISTS idx_orders_ambassador_id ON orders(ambassador_id);

-- 5. Backfill merchant_id for existing orders (Best Effort via events_v2)
UPDATE orders o
SET merchant_id = e.merchant_id
FROM events_v2 e
WHERE o.event_v2_id = e.id
AND o.merchant_id IS NULL;

-- 6. Helper function to normalize code (Optional but useful)
CREATE OR REPLACE FUNCTION normalize_invite_code(code TEXT) 
RETURNS TEXT AS $$
BEGIN
    RETURN UPPER(TRIM(code));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Trigger to auto-update updated_at (Standard practice)
-- (Assuming handle_updated_at trigger function exists, otherwise skipping)
