-- =========================================================
-- 006 - 更新 redeem_invite 支持基于地区的商家创建
-- 当 invite 的 merchant_id 为 NULL 但 region_id 不为 NULL 时，创建新 merchant
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
      
      -- 4e. 更新 invite 的 merchant_id（可选，方便后续查询）
      UPDATE public.invites
      SET merchant_id = v_new_merchant_id,
          updated_at = NOW()
      WHERE id = v_invite.id;
      
      -- 4f. 刷新 v_invite 记录
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
