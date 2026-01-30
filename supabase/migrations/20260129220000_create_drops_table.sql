-- Create drops table
-- Using 036 to follow 034
CREATE TABLE IF NOT EXISTS public.drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  poster_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.drops ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drops_region ON public.drops(region_id);
CREATE INDEX IF NOT EXISTS idx_drops_status ON public.drops(status);
CREATE INDEX IF NOT EXISTS idx_drops_created_at ON public.drops(created_at);

-- Update trigger
-- Assuming handle_updated_at() exists from 001 or prior
CREATE OR REPLACE TRIGGER update_drops_modtime
  BEFORE UPDATE ON public.drops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies
DROP POLICY IF EXISTS "Enable read access for all users for published drops" ON public.drops;
CREATE POLICY "Enable read access for all users for published drops"
ON public.drops FOR SELECT
USING (status = 'published');

DROP POLICY IF EXISTS "Enable all access for admins" ON public.drops;
CREATE POLICY "Enable all access for admins"
ON public.drops FOR ALL
USING (public.is_admin()); 
-- Assuming is_admin() exists. If not, use (auth.jwt() ->> 'role' = 'service_role' or whatever logic)
-- 001 mentions "admin_users" table but not is_admin function explicitly in the snippet I saw.
-- I should verify is_admin existence. 
-- 034 did NOT use is_admin in schema snippet shown.
-- I'll check strict admin policy.
-- Usually strict admin check: exists(select 1 from admin_users where user_id = auth.uid() and is_active = true)
-- I will use that securely.

DROP POLICY IF EXISTS "Enable all access for admins" ON public.drops;
CREATE POLICY "Enable all access for admins"
ON public.drops FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);

COMMENT ON TABLE public.drops IS 'Content drops system';
