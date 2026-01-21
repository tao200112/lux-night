# 🔧 修复 RPC v_venue 错误

## 问题

**错误**: `record "v_venue" is not assigned yet`

**原因**: 当邀请码的 `venue_id` 为 NULL 时，`v_venue` 变量没有被赋值，但在返回结果时尝试访问 `v_venue.name`

## 修复

**位置**: `redeem_invite` RPC 函数，第 182 行

**修改前**:
```sql
'venue_name', COALESCE(v_venue.name, NULL),
```

**修改后**:
```sql
'venue_name', CASE WHEN v_invite.venue_id IS NOT NULL THEN v_venue.name ELSE NULL END,
```

## 执行步骤

### 方法 1: Supabase Dashboard (推荐)

1. 打开 [Supabase Dashboard](https://app.supabase.com)
2. 选择项目 → **SQL Editor**
3. 打开文件：`supabase/scripts/fix-redeem-invite-rpc.sql`
4. 复制全部内容到 SQL Editor
5. 点击 **Run**

### 方法 2: 快速修复（只替换函数）

在 SQL Editor 中执行：

```sql
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED', 'message', 'Must be logged in to redeem invite');
  END IF;
  
  SELECT * INTO v_invite FROM public.invites WHERE token = UPPER(TRIM(p_token)) AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN', 'message', 'Invite code not found or inactive');
  END IF;
  
  IF v_invite.disabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DISABLED', 'message', 'This invite code has been disabled');
  END IF;
  
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EXPIRED', 'message', 'This invite code has expired');
  END IF;
  
  IF v_invite.used_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'USED_UP', 'message', 'This invite code has reached maximum uses');
  END IF;
  
  SELECT * INTO v_merchant FROM public.merchants WHERE id = v_invite.merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MERCHANT_NOT_FOUND', 'message', 'Associated merchant not found');
  END IF;
  
  IF v_invite.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue FROM public.venues WHERE id = v_invite.venue_id AND merchant_id = v_invite.merchant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VENUE_MISMATCH', 'message', 'Venue does not belong to merchant');
    END IF;
  END IF;
  
  SELECT * INTO v_existing_member FROM public.merchant_members WHERE user_id = v_user_id AND merchant_id = v_invite.merchant_id;
  
  IF FOUND THEN
    DECLARE
      v_current_role_rank INT;
      v_new_role_rank INT;
    BEGIN
      v_current_role_rank := CASE v_existing_member.role WHEN 'owner' THEN 4 WHEN 'manager' THEN 3 WHEN 'staff' THEN 2 ELSE 1 END;
      v_new_role_rank := CASE v_invite.intended_role WHEN 'owner' THEN 4 WHEN 'manager' THEN 3 WHEN 'staff' THEN 2 ELSE 1 END;
      
      IF v_new_role_rank > v_current_role_rank THEN
        UPDATE public.merchant_members SET role = v_invite.intended_role, is_active = true, updated_at = NOW() WHERE id = v_existing_member.id;
        v_member_id := v_existing_member.id;
      ELSE
        UPDATE public.merchant_members SET is_active = true, updated_at = NOW() WHERE id = v_existing_member.id;
        v_member_id := v_existing_member.id;
      END IF;
    END;
  ELSE
    INSERT INTO public.merchant_members(merchant_id, user_id, role, is_active) VALUES (v_invite.merchant_id, v_user_id, v_invite.intended_role, true) RETURNING id INTO v_member_id;
  END IF;
  
  IF v_invite.venue_id IS NOT NULL THEN
    INSERT INTO public.member_venues(member_id, venue_id) VALUES (v_member_id, v_invite.venue_id) ON CONFLICT (member_id, venue_id) DO NOTHING;
  END IF;
  
  UPDATE public.invites SET used_count = used_count + 1, updated_at = NOW() WHERE id = v_invite.id;
  
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
    RETURN jsonb_build_object('ok', false, 'error', 'INTERNAL_ERROR', 'message', SQLERRM);
END;
$$;
```

## 测试

执行后，在浏览器中：
1. 刷新页面
2. 输入邀请码: **1461**
3. 点击 **Continue**
4. 成功！🎉

---

**立即去 Dashboard 执行修复！**
