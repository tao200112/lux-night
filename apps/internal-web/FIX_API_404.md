# 🔧 修复邀请码 JSON 错误

## 问题诊断

**错误**: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**原因**: API 路由返回 HTML（404 页面）而不是 JSON

**根本原因**: 修改了 API 代码后，**没有重启 dev server**，所以新代码没有被编译加载

---

## ✅ 解决方案

### 步骤 1: 停止当前服务器

在运行 internal-web 的终端窗口：
```
Ctrl + C
```

### 步骤 2: 重新启动

```bash
cd apps/internal-web
npm run dev
```

或者从项目根目录：
```bash
npm run dev:internal
```

### 步骤 3: 等待编译完成

看到这样的输出：
```
✓ Ready in 3.2s
○ Compiling / ...
✓ Compiled / in 1.2s
```

### 步骤 4: 测试

1. 刷新浏览器
2. 输入邀请码: **1461**
3. 点击 **Continue**
4. 应该成功！

---

## 🎯 预期结果

```json
{
  "ok": true,
  "merchant_id": "...",
  "merchant_name": "Test Merchant (Invite 1461)",
  "role": "owner",
  "message": "Successfully joined Test Merchant (Invite 1461)"
}
```

然后自动跳转到 `/dashboard`

---

## 📝 注意事项

**每次修改 API 代码后都需要**：
- 重启 dev server（或等待 HMR 热更新）
- 对于 API routes，通常需要手动重启
- 对于 UI 组件，HMR 会自动更新

---

**现在去重启服务器！** 🚀
