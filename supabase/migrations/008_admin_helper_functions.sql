-- =========================================================
-- 008 ADMIN HELPER FUNCTIONS
-- Admin 端口辅助函数
-- =========================================================
-- 说明：
-- - generate_invite_token(): 生成唯一的邀请码 token
-- =========================================================

-- 生成唯一邀请码 Token
CREATE OR REPLACE FUNCTION public.generate_invite_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_exists BOOLEAN;
  v_attempts INT := 0;
BEGIN
  LOOP
    -- 生成 6 位随机字符（数字+字母）
    v_token := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    
    -- 检查是否已存在
    SELECT EXISTS(
      SELECT 1 FROM public.invites WHERE token = v_token
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
    
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'Failed to generate unique token after 20 attempts';
    END IF;
  END LOOP;
  
  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.generate_invite_token() IS 'Generate a unique 6-character invite token';
