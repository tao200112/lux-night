# Lux Night 标准开发流程

适用于单人全栈开发的 AI 驱动标准流程。

---

## 1. 生成功能

- **输入**：需求描述（功能点、边界条件）
- **产出**：代码、迁移（如有）、类型定义
- **技能**：nextjs, supabase, stripe, typescript
- **检查点**：
  - [ ] 代码符合项目规范
  - [ ] 类型无报错
  - [ ] 依赖已安装

---

## 2. 自动测试

- **输入**：新/改动的模块
- **产出**：单元测试或 E2E 测试
- **技能**：jest, playwright-testing
- **命令**：
  ```bash
  pnpm run lint
  pnpm test  # 若有配置
  pnpm exec playwright test  # E2E
  ```
- **检查点**：
  - [ ] Lint 通过
  - [ ] 相关测试新增/更新
  - [ ] 测试通过

---

## 3. 本地验证

- **输入**：当前代码
- **产出**：本地运行结果、截图（可选）
- **命令**：
  ```bash
  pnpm run dev:customer   # 或 dev:internal / dev:admin
  pnpm run supabase:start # 本地 Supabase
  ```
- **技能**：playwright, screenshot
- **检查点**：
  - [ ] 页面可正常访问
  - [ ] 关键路径可手动走通
  - [ ] 无控制台报错（关键路径）

---

## 4. 自动部署

- **输入**：通过验证的代码
- **产出**：Vercel 预览或生产 URL
- **技能**：vercel-deploy
- **流程**：
  1. 先部署预览：`vercel deploy -y`
  2. 验证预览环境
  3. 确认后部署生产：`vercel deploy --prod -y`
- **检查点**：
  - [ ] 预览部署成功
  - [ ] 生产部署（如需要）成功
  - [ ] 环境变量已配置

---

## 5. 截图记录

- **输入**：关键页面或完成状态
- **产出**：截图文件
- **技能**：screenshot, playwright
- **建议**：重要功能完成后截图保存，便于文档与回溯

---

## 6. 生成变更文档

- **输入**：本次改动摘要
- **产出**：CHANGELOG 条目、部署说明、简要迁移说明（如有）
- **技能**：document-generator
- **检查点**：
  - [ ] CHANGELOG 已更新
  - [ ] 迁移步骤清晰（如有 DB 变更）

---

## 流程串联示例

```
需求 → 写代码 → 写测试 → 本地跑通 → 部署预览 → 截图 → 更新文档 → 部署生产（可选）
```

可结合 Cursor Agent 或 Codex，按上述步骤顺序执行，每步完成后再进入下一步。
