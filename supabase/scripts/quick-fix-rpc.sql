-- 🔧 快速修复 redeem_invite RPC
-- 在 Supabase Dashboard SQL Editor 中执行这个单行命令

-- 先删除旧函数
DROP FUNCTION IF EXISTS public.redeem_invite(TEXT);

-- 重新创建（带修复）
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
  v_venue_name TEXT;
BEGIN
  -- 1. 校验登录
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED', 'message', 'Must be logged in');
  END IF;
  
  -- 2. 查询 invite
  SELECT * INTO v_invite FROM public.invites WHERE token = UPPER(TRIM(p_token)) AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN', 'message', 'Invite not found');
  END IF;
  
  -- 3. 验证有效性
  IF v_invite.disabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DISABLED', 'message', 'Invite disabled');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EXPIRED', 'message', 'Invite expired');
  END IF;
  IF v_invite.used_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'USED_UP', 'message', 'Invite used up');
  END IF;
  
  -- 4. 查询 merchant
  SELECT * INTO v_merchant FROM public.merchants WHERE id = v_invite.merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MERCHANT_NOT_FOUND', 'message', 'Merchant not found');
  END IF;
  
  -- 5. 查询 venue（安全方式）
  v_venue_name := NULL;
  IF v_invite.venue_id IS NOT NULL THEN
    SELECT name INTO v_venue_name FROM public.venues WHERE id = v_invite.venue_id;
  END IF;
  
  -- 6. 检查已存在成员
  SELECT * INTO v_existing_member FROM public.merchant_members WHERE user_id = v_user_id AND merchant_id = v_invite.merchant_id;
  
  -- 7. Upsert 成员
  IF FOUND THEN
    UPDATE public.merchant_members SET is_active = true, updated_at = NOW() WHERE id = v_existing_member.id;
    v_member_id := v_existing_member.id;
  ELSE
    INSERT INTO public.merchant_members(merchant_id, user_id, role, is_active)
    VALUES (v_invite.merchant_id, v_user_id, v_invite.intended_role, true)
    RETURNING id INTO v_member_id;
  END IF;
  
  -- 8. 更新使用次数
  UPDATE public.invites SET used_count = used_count + 1, updated_at = NOW() WHERE id = v_invite.id;
  
  -- 9. 返回结果（修复：不访问 v_venue.name）
  RETURN jsonb_build_object(
    'ok', true,
    'merchant_id', v_invite.merchant_id,
    'merchant_name', v_merchant.name,
    'role', v_invite.intended_role,
    'venue_id', v_invite.venue_id,
    'venue_name', v_venue_name,
    'member_id', v_member_id,
    'message', 'Successfully joined ' || v_merchant.name
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INTERNAL_ERROR', 'message', SQLERRM);
END;
$$;

-- 验证函数已更新
SELECT 'Function updated successfully!' AS status;
