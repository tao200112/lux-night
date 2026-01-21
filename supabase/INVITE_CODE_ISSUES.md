# 🐛 发现的问题

## 问题 1: Google 登录无法跳转 ❌
**错误**: `DNS_PROBE_FINISHED_NXDOMAIN`
**原因**: Supabase 回调 URL 配置问题或网络问题
**暂时跳过**: 这个是网络/DNS 问题，不影响邀请码测试

---

## 问题 2: 邀请码返回 HTML 而不是 JSON ❌  
**错误**: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
**根本原因**: **缺少 `redeem_preview` RPC 函数！**

### 当前情况：
- ✅ Frontend 调用: `/api/invites/preview` → 调用 `redeem_preview` RPC
- ❌ Database: 只有 `redeem_invite` RPC，**没有** `redeem_preview`
- ❌ 结果: RPC 调用失败 → Supabase 返回错误页面(HTML) → JSON 解析失败

### 解决方案：

**方案 A: 添加 `redeem_preview` RPC（推荐）**
创建只读预览函数，不写库

**方案 B: 前端直接调用 `redeem_invite`（快速）**
去掉预览步骤，直接兑换

---

## 立即修复

我选择 **方案 B**（更快），直接在 invite 页面调用 `redeem_invite` RPC。

理由：
1. 更简单快速
2. `redeem_invite` 本身已经是幂等的（可重复调用）
3. 减少一次 API 调用
