-- ============================================================
-- Migration: Fix Invite Gate and Admin RPC
-- Date: 2026-01-22
-- 
-- Purpose:
-- 1. Ensure profiles.is_admin column exists
-- 2. Create is_admin() RPC function for admin middleware
-- 3. Add quick migration SQL for old users (commented out)
-- ============================================================

-- ============================================================
-- Part 1: Ensure profiles.is_admin column exists
-- ============================================================

DO $$ 
BEGIN
  -- Check if is_admin column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'is_admin'
  ) THEN
    -- Add is_admin column
    ALTER TABLE public.profiles
    ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
    
    RAISE NOTICE 'Added is_admin column to profiles table';
  ELSE
    RAISE NOTICE 'is_admin column already exists in profiles table';
  END IF;
END $$;

-- ============================================================
-- Part 2: Create or replace is_admin() RPC function
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_is_admin BOOLEAN;
BEGIN
  -- Check if the current user (auth.uid()) has is_admin = true
  SELECT is_admin INTO user_is_admin
  FROM public.profiles
  WHERE id = auth.uid();
  
  -- Return false if user not found
  RETURN COALESCE(user_is_admin, FALSE);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.is_admin() IS 'Returns true if the current user is an admin';

-- ============================================================
-- Part 3: Set existing admin users (if any)
-- ============================================================

-- EXAMPLE: Update specific users to be admin
-- Uncomment and replace with your admin emails

/*
UPDATE public.profiles
SET is_admin = TRUE
WHERE email IN (
  'admin@example.com',
  'your@email.com'
);
*/

-- ============================================================
-- Part 4: Quick migration SQL for old users
-- ============================================================

-- IMPORTANT: This SQL is for manual execution ONLY
-- Do NOT uncomment this in a migration file
-- Replace 'YOUR_MERCHANT_ID' with your actual merchant ID

/*

-- Check how many users need migration
SELECT COUNT(*) AS users_without_membership
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.merchant_members mm 
  WHERE mm.user_id = p.id
);

-- Preview which users will be migrated
SELECT 
  p.id,
  p.email,
  p.display_name,
  p.created_at
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.merchant_members mm 
  WHERE mm.user_id = p.id
)
ORDER BY p.created_at ASC
LIMIT 10;

-- ACTUAL MIGRATION: Assign all users without membership to default merchant
-- ⚠️ REPLACE 'YOUR_MERCHANT_ID' BEFORE RUNNING
INSERT INTO public.merchant_members (merchant_id, user_id, role, is_active, created_at)
SELECT 
  'YOUR_MERCHANT_ID',  -- ⚠️ REPLACE THIS
  p.id,
  'staff',
  TRUE,
  NOW()
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.merchant_members mm 
  WHERE mm.user_id = p.id
);

-- Verify migration
SELECT COUNT(*) AS total_memberships
FROM public.merchant_members;

*/

-- ============================================================
-- Part 5: Verification queries
-- ============================================================

-- Check if is_admin RPC function exists and works
DO $$
BEGIN
  RAISE NOTICE 'Verifying is_admin() function...';
  
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin'
  ) THEN
    RAISE NOTICE '✅ is_admin() function exists';
  ELSE
    RAISE WARNING '❌ is_admin() function not found';
  END IF;
END $$;

-- Check profiles.is_admin column
DO $$
BEGIN
  RAISE NOTICE 'Verifying profiles.is_admin column...';
  
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'is_admin'
  ) THEN
    RAISE NOTICE '✅ profiles.is_admin column exists';
  ELSE
    RAISE WARNING '❌ profiles.is_admin column not found';
  END IF;
END $$;
