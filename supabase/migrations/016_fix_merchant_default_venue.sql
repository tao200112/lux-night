-- =========================================================
-- 016 FIX MERCHANT DEFAULT VENUE
-- 修复merchant创建后default_venue_id为空的问题
-- =========================================================
-- 1. 更新redeem_invite函数：创建merchant时自动创建venue并设置default_venue_id
-- 2. 修复历史数据：补齐所有merchant的default_venue_id
-- =========================================================

-- =========================================================
-- Part 1: 更新 redeem_invite 函数，自动创建venue
-- =========================================================

CREATE OR REPLACE FUNCTION public.redeem_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_invite RECORD;
  v_merchant RECORD;
  v_venue RECORD;
  v_existing_member RECORD;
  v_member_id UUID;
  v_result JSONB;
  v_new_merchant_id UUID;
  v_region RECORD;
  v_user_email TEXT;
  v_default_venue_id UUID;
BEGIN
  -- 1. 校验必须已登录
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'NOT_AUTHENTICATED',
      'message', 'Must be logged in to redeem invite'
    );
  END IF;
  
  -- 获取用户邮箱（用于 merchant 名称）
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;
  
  -- 2. 规范化 token 并查询 invite
  SELECT *
  INTO v_invite
  FROM public.invites
  WHERE token = UPPER(TRIM(p_token))
    AND is_active = true
  FOR UPDATE; -- 锁行，避免并发问题
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INVALID_TOKEN',
      'message', 'Invite code not found or inactive'
    );
  END IF;
  
  -- 3. 校验 invite 有效性
  IF v_invite.disabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'DISABLED',
      'message', 'This invite code has been disabled'
    );
  END IF;
  
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'EXPIRED',
      'message', 'This invite code has expired'
    );
  END IF;
  
  IF v_invite.used_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'USED_UP',
      'message', 'This invite code has reached maximum uses'
    );
  END IF;
  
  -- 4. 处理 merchant（新增逻辑：如果 merchant_id 为 NULL，创建新 merchant）
  IF v_invite.merchant_id IS NULL THEN
    -- 4a. 校验必须有 region_id
    IF v_invite.region_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'INVALID_INVITE',
        'message', 'Invite missing region_id for merchant creation'
      );
    END IF;
    
    -- 4b. 校验 region 存在
    SELECT * INTO v_region
    FROM public.regions
    WHERE id = v_invite.region_id AND is_active = true;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'REGION_NOT_FOUND',
        'message', 'Associated region not found or inactive'
      );
    END IF;
    
    -- 4c. 生成 merchant 名称
    DECLARE
      v_merchant_name TEXT;
      v_name_counter INT := 1;
    BEGIN
      v_merchant_name := COALESCE(
        v_user_email,
        'Merchant ' || v_user_id::TEXT
      );
      
      -- 确保名称唯一（添加序号如果重复）
      WHILE EXISTS (
        SELECT 1 FROM public.merchants 
        WHERE region_id = v_invite.region_id 
          AND name = v_merchant_name
      ) LOOP
        v_merchant_name := COALESCE(v_user_email, 'Merchant') || ' (' || v_name_counter || ')';
        v_name_counter := v_name_counter + 1;
      END LOOP;
      
      -- 4d. 创建新 merchant
      INSERT INTO public.merchants(
        id,
        region_id,
        name,
        status
      )
      VALUES (
        gen_random_uuid(),
        v_invite.region_id,
        v_merchant_name,
        'active'
      )
      RETURNING id INTO v_new_merchant_id;
      
      -- 4e. 自动创建默认venue并设置default_venue_id
      INSERT INTO public.venues(
        merchant_id,
        region_id,
        name,
        address,
        timezone,
        is_active
      )
      VALUES (
        v_new_merchant_id,
        v_invite.region_id,
        'Default Venue',
        NULL,
        'America/New_York',
        true
      )
      RETURNING id INTO v_default_venue_id;
      
      -- 4f. 更新merchant的default_venue_id
      UPDATE public.merchants
      SET default_venue_id = v_default_venue_id
      WHERE id = v_new_merchant_id;
      
      -- 4g. 更新 invite 的 merchant_id（可选，方便后续查询）
      UPDATE public.invites
      SET merchant_id = v_new_merchant_id,
          updated_at = NOW()
      WHERE id = v_invite.id;
      
      -- 4h. 刷新 v_invite 记录
      SELECT * INTO v_invite
      FROM public.invites
      WHERE id = v_invite.id;
    END;
  END IF;
  
  -- 5. 获取 merchant 记录（现在应该存在了）
  SELECT * INTO v_merchant
  FROM public.merchants
  WHERE id = v_invite.merchant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'MERCHANT_NOT_FOUND',
      'message', 'Associated merchant not found'
    );
  END IF;
  
  -- 5a. 如果merchant没有default_venue_id，自动创建并设置
  IF v_merchant.default_venue_id IS NULL THEN
    INSERT INTO public.venues(
      merchant_id,
      region_id,
      name,
      address,
      timezone,
      is_active
    )
    VALUES (
      v_merchant.id,
      v_merchant.region_id,
      'Default Venue',
      NULL,
      COALESCE((SELECT timezone FROM public.regions WHERE id = v_merchant.region_id LIMIT 1), 'America/New_York'),
      true
    )
    RETURNING id INTO v_default_venue_id;
    
    UPDATE public.merchants
    SET default_venue_id = v_default_venue_id
    WHERE id = v_merchant.id;
    
    -- 刷新merchant记录
    SELECT * INTO v_merchant
    FROM public.merchants
    WHERE id = v_merchant.id;
  END IF;
  
  -- 6. 校验 venue（如果指定）
  IF v_invite.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue
    FROM public.venues
    WHERE id = v_invite.venue_id
      AND merchant_id = v_invite.merchant_id;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'VENUE_MISMATCH',
        'message', 'Venue does not belong to merchant'
      );
    END IF;
  END IF;
  
  -- 7. 检查是否已是该商户成员
  SELECT * INTO v_existing_member
  FROM public.merchant_members
  WHERE user_id = v_user_id
    AND merchant_id = v_invite.merchant_id;
  
  -- 8. Upsert merchant_members（不降级权限）
  IF FOUND THEN
    -- 已存在：只在 role 升级时更新
    DECLARE
      v_current_role_rank INT;
      v_new_role_rank INT;
    BEGIN
      -- 定义 role 优先级：owner > manager > staff
      v_current_role_rank := CASE v_existing_member.role
        WHEN 'owner' THEN 4
        WHEN 'manager' THEN 3
        WHEN 'staff' THEN 2
        ELSE 1
      END;
      
      v_new_role_rank := CASE v_invite.intended_role
        WHEN 'owner' THEN 4
        WHEN 'manager' THEN 3
        WHEN 'staff' THEN 2
        ELSE 1
      END;
      
      IF v_new_role_rank > v_current_role_rank THEN
        UPDATE public.merchant_members
        SET role = v_invite.intended_role,
            is_active = true,
            updated_at = NOW()
        WHERE id = v_existing_member.id;
        
        v_member_id := v_existing_member.id;
      ELSE
        -- 不降级，仅确保 is_active
        UPDATE public.merchant_members
        SET is_active = true,
            updated_at = NOW()
        WHERE id = v_existing_member.id;
        
        v_member_id := v_existing_member.id;
      END IF;
    END;
  ELSE
    -- 新成员：插入
    INSERT INTO public.merchant_members(
      merchant_id,
      user_id,
      role,
      is_active
    )
    VALUES (
      v_invite.merchant_id,
      v_user_id,
      v_invite.intended_role,
      true
    )
    RETURNING id INTO v_member_id;
  END IF;
  
  -- 9. 如果指定了 venue，写入 member_venues
  IF v_invite.venue_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id)
    VALUES (v_member_id, v_invite.venue_id)
    ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;
  
  -- 10. 更新 invite used_count、redeemed_by、redeemed_at（并发安全）
  UPDATE public.invites
  SET used_count = used_count + 1,
      redeemed_by = v_user_id,
      redeemed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_invite.id;
  
  -- 11. 返回成功结果
  DECLARE
    v_venue_name TEXT;
  BEGIN
    v_venue_name := NULL;
    IF v_invite.venue_id IS NOT NULL AND v_venue.id IS NOT NULL THEN
      v_venue_name := v_venue.name;
    END IF;
    
    v_result := jsonb_build_object(
      'ok', true,
      'merchant_id', v_invite.merchant_id,
      'merchant_name', v_merchant.name,
      'region_id', v_merchant.region_id,
      'role', v_invite.intended_role,
      'venue_id', v_invite.venue_id,
      'venue_name', v_venue_name,
      'member_id', v_member_id,
      'merchant_created', (v_new_merchant_id IS NOT NULL),
      'default_venue_id', v_merchant.default_venue_id,
      'message', 'Successfully joined ' || v_merchant.name
    );
  END;
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INTERNAL_ERROR',
      'message', SQLERRM
    );
END;
$$;

-- =========================================================
-- Part 2: 修复历史数据 - 补齐所有merchant的default_venue_id
-- =========================================================

DO $$
DECLARE
  v_merchant RECORD;
  v_existing_venue RECORD;
  v_new_venue_id UUID;
  v_fixed_count INT := 0;
  v_created_count INT := 0;
BEGIN
  -- 遍历所有没有default_venue_id的active merchant
  FOR v_merchant IN
    SELECT id, name, region_id
    FROM public.merchants
    WHERE default_venue_id IS NULL
      AND status = 'active'
  LOOP
    -- 检查是否已有venue
    SELECT id INTO v_existing_venue
    FROM public.venues
    WHERE merchant_id = v_merchant.id
      AND is_active = true
    ORDER BY created_at
    LIMIT 1;
    
    IF v_existing_venue.id IS NOT NULL THEN
      -- 使用已有venue
      UPDATE public.merchants
      SET default_venue_id = v_existing_venue.id
      WHERE id = v_merchant.id;
      
      v_fixed_count := v_fixed_count + 1;
      RAISE NOTICE 'Fixed merchant % (%) - using existing venue %', v_merchant.id, v_merchant.name, v_existing_venue.id;
    ELSE
      -- 创建新venue
      INSERT INTO public.venues(
        merchant_id,
        region_id,
        name,
        address,
        timezone,
        is_active
      )
      VALUES (
        v_merchant.id,
        v_merchant.region_id,
        'Default Venue',
        NULL,
        'America/New_York',
        true
      )
      RETURNING id INTO v_new_venue_id;
      
      UPDATE public.merchants
      SET default_venue_id = v_new_venue_id
      WHERE id = v_merchant.id;
      
      v_created_count := v_created_count + 1;
      RAISE NOTICE 'Created default venue % for merchant % (%)', v_new_venue_id, v_merchant.id, v_merchant.name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Historical data fix completed!';
  RAISE NOTICE '  - Fixed merchants (using existing venue): %', v_fixed_count;
  RAISE NOTICE '  - Created venues for merchants: %', v_created_count;
  RAISE NOTICE '========================================';
END $$;

-- =========================================================
-- Part 3: 创建触发器 - 确保新merchant自动有default_venue_id
-- =========================================================

-- 注意：由于redeem_invite函数已经处理了venue创建，这个触发器作为备用保障
-- 如果通过其他方式创建merchant（如直接INSERT），触发器会确保有default_venue_id

CREATE OR REPLACE FUNCTION public.ensure_merchant_default_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_default_venue_id UUID;
BEGIN
  -- 只在merchant创建时（INSERT）且default_venue_id为NULL时触发
  IF TG_OP = 'INSERT' AND NEW.default_venue_id IS NULL AND NEW.status = 'active' THEN
    -- 创建默认venue
    INSERT INTO public.venues(
      merchant_id,
      region_id,
      name,
      address,
      timezone,
      is_active
    )
    VALUES (
      NEW.id,
      NEW.region_id,
      'Default Venue',
      NULL,
      COALESCE((SELECT timezone FROM public.regions WHERE id = NEW.region_id LIMIT 1), 'America/New_York'),
      true
    )
    RETURNING id INTO v_default_venue_id;
    
    -- 更新merchant的default_venue_id
    NEW.default_venue_id := v_default_venue_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS trg_ensure_merchant_default_venue ON public.merchants;

-- 创建触发器
CREATE TRIGGER trg_ensure_merchant_default_venue
BEFORE INSERT ON public.merchants
FOR EACH ROW
EXECUTE FUNCTION public.ensure_merchant_default_venue();

-- =========================================================
-- 完成
-- =========================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Merchant default venue fix completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Updated redeem_invite function to auto-create venue';
  RAISE NOTICE '  - Fixed historical merchants missing default_venue_id';
  RAISE NOTICE '  - Created trigger to ensure new merchants have default venue';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  - All active merchants now have default_venue_id';
  RAISE NOTICE '  - New merchants will auto-create default venue';
  RAISE NOTICE '========================================';
END $$;
