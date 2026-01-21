-- Fix redeem_invite RPC - v_venue bug
-- Execute in Supabase Dashboard SQL Editor

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
  
  -- 2. 规范化 token 并查询 invite
  SELECT *
  INTO v_invite
  FROM public.invites
  WHERE token = UPPER(TRIM(p_token))
    AND is_active = true
  FOR UPDATE;
  
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
  
  -- 4. 校验 merchant 存在
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
  
  -- 5. 校验 venue（如果指定）
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
  
  -- 6. 检查是否已是该商户成员
  SELECT * INTO v_existing_member
  FROM public.merchant_members
  WHERE user_id = v_user_id
    AND merchant_id = v_invite.merchant_id;
  
  -- 7. Upsert merchant_members（不降级权限）
  IF FOUND THEN
    -- 已存在：只在 role 升级时更新
    DECLARE
      v_current_role_rank INT;
      v_new_role_rank INT;
    BEGIN
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
  
  -- 8. 如果指定了 venue，写入 member_venues
  IF v_invite.venue_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id)
    VALUES (v_member_id, v_invite.venue_id)
    ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;
  
  -- 9. 更新 invite used_count（并发安全）
  UPDATE public.invites
  SET used_count = used_count + 1,
      updated_at = NOW()
  WHERE id = v_invite.id;
  
  -- 10. 返回成功结果（修复：使用 CASE 而不是 COALESCE）
  v_result := jsonb_build_object(
    'ok', true,
    'merchant_id', v_invite.merchant_id,
    'merchant_name', v_merchant.name,
    'role', v_invite.intended_role,
    'venue_id', v_invite.venue_id,
    'venue_name', CASE WHEN v_invite.venue_id IS NOT NULL THEN v_venue.name ELSE NULL END,
    'member_id', v_member_id,
    'message', 'Successfully joined ' || v_merchant.name
  );
  
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
