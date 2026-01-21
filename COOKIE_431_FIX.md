# Cookie 431 错误修复

## 问题描述

**HTTP 431 错误**: "Request Header Fields Too Large"
- 请求头（特别是 Cookie）超过服务器限制
- 通常发生在 cookie 累积过多的情况下

## 问题根因

1. **Cookie 累积**：
   - 每次 OAuth 登录都会创建新的 cookie
   - 旧的 cookie 没有被清理
   - 导致 cookie 数量不断增加

2. **Cookie 过滤逻辑过于宽松**：
   - `getAll()` 方法可能匹配到大量 cookie
   - 包括无前缀的旧 cookie
   - 两个 app（customer/internal）的 cookie 可能都被匹配

3. **没有清理机制**：
   - 设置新 cookie 前没有清理旧 cookie
   - 导致同一类型的 cookie 存在多个版本

## 修复方案

### 1. 优化 Cookie 过滤逻辑 (`packages/shared/src/supabase/server.ts`)

**修复内容**：
- **严格过滤**：只匹配带前缀的 cookie（`sb-customer-*` 或 `sb-internal-*`）
- **限制返回数量**：最多返回 4 个 cookie（Supabase 通常只需要 access_token 和 refresh_token）
- **不再匹配无前缀 cookie**：避免 cookie 累积

**关键代码**：
```typescript
// 只匹配该 app 的 cookie（严格过滤）
const filtered = allCookies.filter(cookie => {
  // 优先匹配带前缀的 cookie（setAll 写入的格式）
  if (cookie.name.startsWith(cookiePrefix + '-')) {
    return true;
  }
  // 匹配包含 appType 的 cookie（备用格式）
  if (cookie.name.includes(`-${appType}-`)) {
    return true;
  }
  // 注意：不再匹配无前缀的 cookie，避免 cookie 累积
  return false;
});

// 限制返回的 cookie 数量（只返回最新的 session cookie）
const limited = filtered.slice(0, 4); // 最多返回 4 个 cookie
```

### 2. 清理旧 Cookie (`packages/shared/src/supabase/server.ts`)

**修复内容**：
- 在设置新 cookie 前，先清理旧的无前缀 cookie
- 通过设置空值和过期时间来删除旧 cookie

**关键代码**：
```typescript
// 先清理旧的同名 cookie（无前缀版本）
cookiesToSet.forEach(({ name }) => {
  if (name.startsWith('sb-') && !name.includes(`-${appType}-`)) {
    const oldCookies = allCookies.filter(c => 
      c.name === name && 
      !c.name.startsWith(cookiePrefix + '-')
    );
    // 设置空值和过期时间来清理
    oldCookies.forEach(oldCookie => {
      cookieStore.set(oldCookie.name, '', {
        expires: new Date(0),
        path: '/',
      });
    });
  }
});
```

### 3. 创建清理 Cookie API (`apps/customer-web/app/api/auth/clear-cookies/route.ts`)

**作用**：
- 提供手动清理 cookie 的接口
- 可以在需要时调用（例如：登录前、登出时）

**使用方式**：
```typescript
// 手动清理 cookie
await fetch('/api/auth/clear-cookies', { method: 'POST' });
```

### 4. 在 Callback 中清理旧 Cookie (`apps/customer-web/app/auth/callback/route.ts`)

**修复内容**：
- 在交换 code 之前，检测并记录旧的 auth cookie
- 虽然不能直接删除（因为 cookies() API 限制），但可以帮助调试

## 验证步骤

1. **清除浏览器数据**
   - DevTools → Application → Clear storage → Clear site data
   - 或者手动删除所有 `sb-*` 相关的 cookie

2. **重新登录**
   - 访问 `http://localhost:3000/login`
   - 点击 Google 登录

3. **检查 Cookie 数量**
   - DevTools → Application → Cookies → `http://localhost:3000`
   - 应该只有少量 cookie（通常 2-4 个）
   - 所有 cookie 应该以 `sb-customer-` 开头

4. **检查请求头大小**
   - DevTools → Network → 查看任意请求
   - 检查 Request Headers 中的 `Cookie:` 行
   - 应该不会太长（通常 < 2KB）

5. **验证登录**
   - 应该能够正常登录，不再出现 431 错误
   - 页面应该正常加载

## 如果仍然失败

### 手动清理 Cookie

1. **使用浏览器 DevTools**：
   - DevTools → Application → Cookies → `http://localhost:3000`
   - 删除所有 `sb-*` 相关的 cookie
   - 刷新页面

2. **使用清理 API**：
   ```bash
   curl -X POST http://localhost:3000/api/auth/clear-cookies
   ```

3. **检查 Cookie 列表**：
   - 服务器日志中会打印所有 cookie 数量
   - 如果 cookie 数量仍然很多，可能需要进一步优化

### 进一步优化

如果问题仍然存在，可以考虑：

1. **减少 Cookie 大小**：
   - 检查 session 数据是否过大
   - 考虑使用 session storage 而不是 cookie

2. **服务器配置**：
   - 增加 Next.js 服务器的 `maxHeaderSize` 限制
   - 但这不是推荐的解决方案

3. **完全禁用旧 Cookie 匹配**：
   - 在 `getAll()` 中只返回最新的 cookie
   - 完全忽略无前缀的旧 cookie

## 预期结果

修复后：
- ✅ Cookie 数量保持在合理范围（2-4 个）
- ✅ 所有 cookie 使用带前缀的格式（`sb-customer-*`）
- ✅ 不再出现 431 错误
- ✅ 登录流程正常工作
- ✅ 页面加载正常

## 调试日志

在开发环境中，会输出以下日志：

```
[SUPABASE SERVER CUSTOMER] Total cookies: X | Auth cookies: [...]
[SUPABASE SERVER CUSTOMER] Filtered cookies (X -> Y): [...]
[CUSTOMER AUTH CALLBACK] Found X old auth cookies to clean
```

这些日志可以帮助识别 cookie 累积问题。
