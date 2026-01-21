# UTF-8 编码问题修复报告

## 根因分析

### 问题根源

检测发现 `apps/internal-web` 目录下的 **19 个 TypeScript 文件**都使用了 **UTF-16 LE (Little Endian)** 编码，而不是标准的 UTF-8 编码。

### 具体原因

1. **文件编码**: 这些文件最初可能是在 Windows 编辑器（如记事本）中以 "Unicode" 编码保存的，该编码实际上是 UTF-16 LE。
2. **非法字节**: 当 Next.js 编译器尝试以 UTF-8 读取 UTF-16 LE 文件时，会遇到大量无效的字节序列（特别是 `0x00` null 字节）。
3. **错误表现**: Next.js 报错 "stream did not contain valid UTF-8" 或包含 `\uFFFD` replacement character。

### 受影响的文件列表（19 个）

所有文件都从 **UTF-16 LE** 修复为 **UTF-8 (无 BOM)**:

1. `apps/internal-web/app/api/checkins/route.ts`
2. `apps/internal-web/app/api/invites/create/route.ts`
3. `apps/internal-web/app/api/invites/redeem/route.ts`
4. `apps/internal-web/app/api/staff/route.ts`
5. `apps/internal-web/app/api/workspace/select/route.ts`
6. `apps/internal-web/app/auth/callback/route.ts`
7. `apps/internal-web/app/invite/page.tsx`
8. `apps/internal-web/app/login/page.tsx`
9. `apps/internal-web/lib/auth/client.ts`
10. `apps/internal-web/lib/data/internal/checkins.ts`
11. `apps/internal-web/lib/data/internal/dashboard.ts`
12. `apps/internal-web/lib/data/internal/events.ts`
13. `apps/internal-web/lib/data/internal/invites.ts`
14. `apps/internal-web/lib/data/internal/requests.ts`
15. `apps/internal-web/lib/data/internal/staff.ts`
16. `apps/internal-web/lib/data/internal/workspaces.ts`
17. `apps/internal-web/lib/internal/auth.ts`
18. `apps/internal-web/lib/internal/permissions.ts`
19. `apps/internal-web/lib/internal/workspace.ts`

## 修复措施

### 1. 批量修复
- 使用 Node.js 脚本检测并修复所有受影响的文件
- 将所有 UTF-16 LE 编码文件转换为 UTF-8 (无 BOM)
- 保留文件内容和格式不变

### 2. 缓存清理
- 删除 `apps/internal-web/.next` 构建缓存
- 删除 `.turbo` 缓存（如存在）
- 确保重新编译时使用正确的文件编码

### 3. 预防措施

#### 3.1 EditorConfig (`.editorconfig`)
已创建 `.editorconfig` 文件，强制所有编辑器使用 UTF-8 编码：

```ini
[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

#### 3.2 VSCode 设置 (`.vscode/settings.json`)
已创建 VSCode 工作区设置：

```json
{
  "files.encoding": "utf8",
  "files.autoGuessEncoding": false,
  "files.eol": "\n"
}
```

**重要**: 禁用 `files.autoGuessEncoding`，强制使用 UTF-8，避免自动猜测错误编码。

## 如何预防

### 编辑器设置

1. **VSCode**
   - 设置 `files.encoding` 为 `utf8`
   - 禁用 `files.autoGuessEncoding`
   - 使用 `.editorconfig` 插件（推荐安装 "EditorConfig for VS Code"）

2. **其他编辑器**
   - 确保默认文件编码为 UTF-8 (无 BOM)
   - Windows 记事本: 保存时选择 "UTF-8"（不是 "Unicode"）
   - 不要使用 Windows 记事本的 "Unicode" 编码（实际是 UTF-16）

3. **Git 配置**
   - 确保 `.gitattributes` 包含:
     ```
     * text=auto eol=lf
     *.{ts,tsx,js,jsx} text eol=lf
     ```

### 验证步骤

修复后，运行以下命令验证文件编码：

```bash
node check_encoding.cjs
```

如果所有文件都显示 "✅ 所有文件都可以用 UTF-8 正确解码"，则修复成功。

## 修复后的验证

1. ✅ 所有 19 个文件已从 UTF-16 LE 转换为 UTF-8 (无 BOM)
2. ✅ 构建缓存已清理
3. ✅ `.editorconfig` 已创建
4. ✅ `.vscode/settings.json` 已创建
5. ✅ 已重新保存关键文件（如 `login/page.tsx`）为 UTF-8

## 后续步骤

1. 重新启动开发服务器: `npx -y pnpm@latest dev:internal`
2. 检查浏览器控制台是否还有编码错误
3. 如果仍有问题，检查 `packages/shared` 目录下的文件

---

**修复日期**: 2024-01-XX  
**修复脚本**: `check_encoding.cjs`  
**修复文件数**: 19 个
