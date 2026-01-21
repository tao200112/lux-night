-- =========================================================
-- 005 - 添加 region_id 到 invites 表，支持基于地区的商家邀请码创建
-- =========================================================

-- 1. 添加 region_id 字段
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_invites_region ON public.invites(region_id) WHERE region_id IS NOT NULL;

-- 3. 修改 merchant_id 为可选（对于创建新 merchant 的邀请码）
-- PostgreSQL 外键约束默认允许 NULL，但列定义不允许
-- 需要先查找并移除外键约束，修改列，再重新添加约束
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- 查找 merchant_id 的外键约束名称
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.invites'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum 
      FROM pg_attribute 
      WHERE attrelid = 'public.invites'::regclass 
        AND attname = 'merchant_id'
    )];
  
  -- 如果找到约束，删除它
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

-- 修改 merchant_id 为可选
ALTER TABLE public.invites
ALTER COLUMN merchant_id DROP NOT NULL;

-- 重新添加外键约束（允许 NULL）
ALTER TABLE public.invites
ADD CONSTRAINT invites_merchant_id_fkey 
FOREIGN KEY (merchant_id) 
REFERENCES public.merchants(id) 
ON DELETE CASCADE;

-- 4. 添加注释说明
COMMENT ON COLUMN public.invites.region_id IS 
'Region ID for ADMIN_TO_MERCHANT invites. Required when merchant_id is NULL to create a new merchant in this region.';

COMMENT ON COLUMN public.invites.merchant_id IS 
'Merchant ID. NULL for ADMIN_TO_MERCHANT invites that create a new merchant on redemption.';

-- 5. 添加 CHECK 约束（确保逻辑正确）
-- 注意：PostgreSQL 不允许直接修改约束，需要先删除再添加
-- 如果约束已存在，先删除
ALTER TABLE public.invites 
DROP CONSTRAINT IF EXISTS invites_merchant_or_region_check;

ALTER TABLE public.invites
ADD CONSTRAINT invites_merchant_or_region_check 
CHECK (
  -- 情况 1: ADMIN 创建的 owner/manager 邀请码（创建新 merchant）
  -- 必须有 region_id，merchant_id 可以为 NULL
  (
    issued_by_type = 'admin' 
    AND intended_role IN ('owner', 'manager') 
    AND region_id IS NOT NULL
  )
  OR
  -- 情况 2: MERCHANT 创建的邀请码（绑定已有 merchant）
  -- 必须有 merchant_id
  (
    issued_by_type = 'merchant' 
    AND merchant_id IS NOT NULL
  )
  OR
  -- 情况 3: 已有 merchant_id 的邀请码（向后兼容）
  (merchant_id IS NOT NULL)
);

-- 6. 为现有的 admin invites 填充 region_id（如果可能）
-- 如果 invite 的 merchant_id 已存在，从 merchant 获取 region_id
UPDATE public.invites i
SET region_id = m.region_id
FROM public.merchants m
WHERE i.merchant_id = m.id
  AND i.region_id IS NULL
  AND i.issued_by_type = 'admin';
