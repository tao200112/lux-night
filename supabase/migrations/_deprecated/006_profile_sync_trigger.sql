-- =========================================================
-- Profile Auto-Creation Trigger
-- =========================================================
-- This trigger automatically creates a profile entry when a new user is created in auth.users
-- This ensures that every authenticated user has a corresponding profile

-- Function to create profile when user is created
-- This function runs with SECURITY DEFINER to bypass RLS policies
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  display_name_text TEXT;
BEGIN
  -- Extract display name from user metadata or email
  display_name_text := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(COALESCE(NEW.email, 'user'), '@', 1),
    'User'
  );

  -- Insert profile (ON CONFLICT prevents errors if profile already exists)
  INSERT INTO public.profiles (id, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    display_name_text,
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to run on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Migrate Existing Users
-- =========================================================
-- This script creates profiles for any existing users in auth.users who don't have a profile yet
-- Note: This must be run with service_role key or by a user with access to auth.users

-- Function to migrate existing users (can be called by admin)
CREATE OR REPLACE FUNCTION public.migrate_existing_users_to_profiles()
RETURNS TABLE(users_migrated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  migrated_count INTEGER := 0;
BEGIN
  -- Insert profiles for users who don't have one
  INSERT INTO public.profiles (id, display_name, created_at, updated_at)
  SELECT 
    au.id,
    COALESCE(
      au.raw_user_meta_data->>'full_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'display_name',
      split_part(COALESCE(au.email, 'user'), '@', 1),
      'User'
    ) as display_name,
    COALESCE(au.created_at, NOW()) as created_at,
    COALESCE(au.updated_at, NOW()) as updated_at
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  WHERE p.id IS NULL  -- Only insert if profile doesn't exist
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RETURN QUERY SELECT migrated_count;
END;
$$;

-- Run migration for existing users
SELECT * FROM public.migrate_existing_users_to_profiles();

-- =========================================================
-- Grant necessary permissions (if needed)
-- =========================================================
-- Ensure the function has proper permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.profiles TO postgres, authenticated, service_role;
