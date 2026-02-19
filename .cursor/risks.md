# 风险提示与使用建议

---

## 一、自动执行脚本的风险

### 1. 破坏性命令

- **rm / del**：可能误删重要文件或目录
- **git reset --hard**：会丢失未提交更改
- **db push / migrate**：可能破坏数据结构或数据
- **npm/pnpm 全局安装**：可能覆盖系统依赖

### 2. 网络与资源消耗

- **vercel deploy**：会调用 Vercel API，产生部署记录
- **API 调用**：imagegen、OpenAI 等会消耗额度
- **curl / wget**：可能下载不可信资源或暴露内网

### 3. 缓解措施

- 对 `rm`、`git reset`、`db push` 等命令，要求**人工确认**后再执行
- 部署、迁移前先做**预览/演练**
- 敏感操作前先**说明将要执行的命令**，由用户确认
- 使用沙箱或权限 escalation 时，理解其影响范围

---

## 二、Skill 过多加载的性能问题

### 1. 表现

- **上下文膨胀**：每个 Skill 的 SKILL.md 会占用上下文窗口
- **响应变慢**：模型需要处理更多指令与示例
- **无关建议**：过多技能可能触发不相关的能力，干扰输出

### 2. 建议

- **分级加载**：核心技能（如 nextjs、supabase）常驻；其他按任务启用
- **控制数量**：同时活跃技能建议不超过 5–7 个
- **精简 SKILL.md**：每个技能控制在 500 行以内，详细内容放到 reference 文件
- **项目级覆盖**：在 `.cursor/skills.md` 中列出本项目常用技能，减少全局技能数量

### 3. 推荐默认加载（个人创业场景）

| 类型 | 建议默认加载 | 按需加载 |
|------|--------------|----------|
| Core | vercel-deploy, playwright | screenshot, jupyter, imagegen, security |
| Development | nextjs, supabase, typescript | express, stripe |
| Testing | - | jest, playwright-testing |
| DevOps | - | docker, github-actions |
| Docs/Data | - | document-generator, mermaid, sql-optimizer, analytics |

---

## 三、如何分级授权

### 1. 权限级别

| 级别 | 含义 | 示例 |
|------|------|------|
| L1 自动 | 无需确认即可执行 | 读文件、lint、本地 build |
| L2 提示 | 执行前说明操作，用户可取消 | 安装 npm 包、运行测试 |
| L3 确认 | 必须用户明确同意 | vercel deploy、db push |
| L4 禁止 | 不执行 | 读取 .env、删除项目根目录 |

### 2. 在提示中声明

可在系统提示或 `.cursorrules` 中写明：

```
- 执行 vercel deploy、supabase db push、git reset 前必须明确告知并等待确认
- 禁止读取或引用 .env、*.key、*.pem 等敏感文件
- 执行未知来源脚本前，先展示脚本内容
```

### 3. 沙箱与网络

- Cursor/Codex 的 sandbox 会限制网络与文件系统
- 部署、API 调用等需要 `require_escalated` 时，应向用户说明原因后再执行

---

## 四、不建议默认开启的能力

| 能力 | 原因 |
|------|------|
| **imagegen** | 消耗 API 额度，非日常必需 |
| **security-best-practices** | 全量扫描耗时长，适合按需对指定模块执行 |
| **gh-fix-ci** | 仅在 CI 失败时有用 |
| **sql-optimizer** | 仅在优化查询时有用 |
| **analytics-helper** | 数据分析场景才需要 |
| **docker / github-actions** | 改基础设施时再启用 |
| **document-generator / mermaid-diagram** | 写文档时按需启用 |

**原则**：默认只加载与当前任务强相关的技能，其余按需启用，避免上下文浪费和无关建议。
