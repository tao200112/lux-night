# AI 自动化开发指南

---

## 一、标准 AI 驱动开发流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AI 驱动开发流程                                    │
└─────────────────────────────────────────────────────────────────────┘

 1. 需求解析
    └─ 与 AI 澄清功能范围、边界、数据模型
    └─ 产出：任务分解清单

 2. 代码生成
    └─ 按清单逐项生成代码
    └─ 技能：nextjs, supabase, stripe, typescript

 3. 静态检查
    └─ pnpm run lint
    └─ TypeScript 类型检查

 4. 测试编写与执行
    └─ 单元测试：jest
    └─ E2E：playwright
    └─ 技能：jest, playwright-testing

 5. 本地验证
    └─ pnpm run dev:* + supabase:start
    └─ 手动或 Playwright 验证关键路径
    └─ 技能：playwright, screenshot

 6. 部署预览
    └─ vercel deploy -y（先预览）
    └─ 技能：vercel-deploy

 7. 预览验证
    └─ 在预览 URL 上复测
    └─ 截图留存（可选）

 8. 文档与发布
    └─ 更新 CHANGELOG、部署说明
    └─ 技能：document-generator
    └─ 确认无误后：vercel deploy --prod -y
```

**原则**：每步通过后再进行下一步，避免未验证代码进入生产。

---

## 二、每日开发启动提示模板

复制以下模板到 Cursor / Codex，根据当日任务修改 `【】` 内容：

```
【今日目标】
- 主任务：【例如：完成商户活动创建流程】
- 次要任务：【例如：修复登录页样式】

【环境准备】
- 已启动 Supabase 本地：pnpm run supabase:start
- 已启动对应 app：pnpm run dev:customer / dev:internal / dev:admin

【当前上下文】
- 项目：lux-night monorepo
- 主技术栈：Next.js + Supabase + Stripe
- 工作目录：apps/customer-web（或 internal-web / admin-web）

【期望产出】
- 代码通过 lint
- 关键路径有测试覆盖
- 今日完成可部署到预览环境

请按 workflow.md 的标准流程协助完成上述任务。
```

---

## 三、发布前检查清单

### 代码与测试

- [ ] `pnpm run lint` 通过
- [ ] TypeScript 无报错
- [ ] 新增/改动逻辑有对应测试
- [ ] 本地 `pnpm run build` 成功
- [ ] 本地关键流程可完整走通

### 数据库与配置

- [ ] Supabase 迁移已编写并在本地验证
- [ ] 无敏感信息硬编码（密钥、密码等）
- [ ] 环境变量已在 Vercel 配置（Preview + Production）

### 部署与回滚

- [ ] 预览部署已成功
- [ ] 预览环境功能验证通过
- [ ] 已知如何回滚（Vercel 控制台 / git revert）
- [ ] 重要迁移有回滚方案

### 文档与沟通

- [ ] CHANGELOG 已更新
- [ ] 如有破坏性变更，已记录迁移步骤
- [ ] 部署说明已同步（deployment.md）

---

## 四、安全权限建议表

| 能力/操作 | 建议权限 | 说明 |
|-----------|----------|------|
| 读取项目代码 | ✅ 默认允许 | 分析与生成代码需要 |
| 执行 lint / test | ✅ 默认允许 | 本地无副作用 |
| 执行 build | ✅ 默认允许 | 本地构建 |
| 执行 vercel deploy（预览） | ⚠️ 需确认 | 会发起网络请求并创建资源 |
| 执行 vercel deploy --prod | ⚠️ 显式授权 | 影响生产环境 |
| 执行数据库迁移（supabase db push） | ⚠️ 显式授权 | 会修改数据库结构 |
| 执行任意 shell 脚本 | ⚠️ 审慎授权 | 可能含 rm、curl 等危险命令 |
| 访问 .env / 密钥文件 | ❌ 禁止读取 | 避免泄露 |
| 修改 .git/config、CI 配置 | ⚠️ 审慎授权 | 可能影响协作与流水线 |
| imagegen / API 调用 | ⚠️ 按需 | 消耗 API 额度 |
| 安装 npm 包 | ✅ 允许 | 常规开发依赖 |

**原则**：对生产环境、数据库、密钥相关操作一律需要人工确认；脚本执行前先理解其内容。
