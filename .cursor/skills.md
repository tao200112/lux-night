# Lux Night 项目可用技能

本项目基于 Next.js + Supabase + Stripe 技术栈，以下为推荐可用技能及调用方式。

---

## 一、核心技能

| 技能 | 用途 | 推荐调用方式 |
|------|------|--------------|
| **vercel-deploy** | 部署到 Vercel | "部署当前项目"、"创建预览部署"、"部署 customer-web 到生产" |
| **playwright** | 浏览器自动化、E2E | "用 Playwright 打开登录页并截图"、"自动填写表单并提交" |
| **screenshot** | 桌面/窗口截图 | "截取当前页面"、"截取应用窗口" |
| **jupyter-notebook** | 数据分析、实验 | "创建 Jupyter 笔记本分析订单数据"、"用 notebook 做 Supabase 查询实验" |
| **security-best-practices** | 安全审查 | "对 auth 模块做安全审查"、"检查 API 安全漏洞" |
| **imagegen** | 图片生成 | "生成产品图"、"生成 banner 图" |

---

## 二、开发增强

| 技能 | 用途 | 推荐调用方式 |
|------|------|--------------|
| **nextjs** | Next.js 开发 | "按 App Router 添加新路由"、"创建 API route" |
| **supabase** | 数据库、Auth | "写 Supabase RPC 调用"、"配置 Row Level Security" |
| **stripe** | 支付、订阅 | "实现 Stripe Checkout"、"处理 Webhook" |
| **typescript** | 类型与配置 | "补全类型定义"、"修复 ts 报错" |

---

## 三、测试

| 技能 | 用途 | 推荐调用方式 |
|------|------|--------------|
| **jest** | 单元测试 | "为 X 模块写 jest 测试" |
| **playwright-testing** | E2E 测试 | "写登录流程 E2E 测试" |

---

## 四、DevOps

| 技能 | 用途 | 推荐调用方式 |
|------|------|--------------|
| **docker** | 容器化 | "写 Dockerfile"、"写 docker-compose" |
| **github-actions** | CI/CD | "写 deploy workflow"、"修复 CI 失败" |

---

## 五、文档与数据

| 技能 | 用途 | 推荐调用方式 |
|------|------|--------------|
| **document-generator** | 文档生成 | "生成 CHANGELOG"、"生成 API 文档" |
| **mermaid-diagram** | 流程图 | "画用户流程 Mermaid 图"、"画 ER 图" |
| **sql-optimizer** | SQL 优化 | "优化这条 Supabase 查询"、"建议索引" |
| **analytics-helper** | 数据分析 | "分析订单转化率"、"生成报表建议" |

---

## 常见任务示例

### 1. 新增功能

```
请帮我实现【商户创建活动】功能：
1. 在 admin-web 添加表单页
2. 调用 Supabase 写入 events 表
3. 使用 Next.js App Router
```

### 2. 自动测试

```
用 Playwright 写登录流程的 E2E 测试，覆盖 customer-web 的登录页。
```

### 3. 部署

```
将 customer-web 部署到 Vercel 预览环境，并返回链接。
```

### 4. 安全审查

```
对 apps/internal-web 的 API 路由做安全最佳实践审查。
```

### 5. 文档生成

```
根据本次改动生成 CHANGELOG 条目和简短部署说明。
```

---

## 项目结构参考

- `apps/customer-web` - 客户端
- `apps/internal-web` - 内部运营
- `apps/admin-web` - 管理后台
- `packages/*` - 共享包
- `supabase/` - 数据库与迁移
