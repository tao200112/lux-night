# 邀请码相关 SQL 文件说明

## 文件对比

### 1. `supabase/migrations/015_seed_example.sql` (Migration 种子数据文件)

**位置**: `supabase/migrations/015_seed_example.sql`

**用途**: Migration 种子数据示例文件（应该执行）

**特点**:
- ✅ 位于 migrations 目录，属于数据库迁移的一部分
- ✅ 提供**正确的种子数据示例**（无硬编码 UUID）
- ✅ 包含完整的创建流程：merchants → venues → invites
- ✅ 可以直接在 Supabase Dashboard SQL Editor 中执行
- ✅ 包含 DO 块示例，可以一次性创建商户和设置 owner

**主要内容**:
1. 创建商户示例（可以直接执行）
2. 创建场地示例（已注释，需要 region_id）
3. 通过 RPC 创建邀请码（推荐方式）
4. 手动创建 owner 用户示例
5. 完整流程的 DO 块示例（推荐使用）

**使用场景**: 
- 在 Supabase Dashboard 中执行，创建测试数据
- 首次设置商户和邀请码时使用

---

### 2. `create_invite_code.sql` (参考文档文件)

**位置**: 项目根目录 `create_invite_code.sql`

**用途**: 详细的邀请码创建和管理参考文档（大部分已注释）

**特点**:
- 📚 位于项目根目录，作为参考文档
- 📚 提供**全面的邀请码操作示例**（创建、查询、管理）
- ⚠️  大部分示例已被注释，**不会直接执行**
- 📚 包含多种创建方式：直接 INSERT、使用函数、使用 RPC
- 📚 包含查询、管理、禁用等完整操作示例

**主要内容**:
1. 查询商户和场地（SELECT 语句，可以直接执行）
2. 创建邀请码示例（已注释，需要修改后执行）
3. 验证邀请码查询（SELECT 语句，可以直接执行）
4. 便捷函数 `create_merchant_invite`（已创建）
5. 使用 RPC 函数 `create_invite_code`（推荐）
6. 管理邀请码（禁用、启用、删除等，已注释）

**使用场景**:
- 作为参考文档查看
- 复制示例代码，修改后使用
- 学习邀请码的各种操作方式

---

## 关键区别

| 特性 | 015_seed_example.sql | create_invite_code.sql |
|------|---------------------|----------------------|
| **位置** | `supabase/migrations/` | 项目根目录 |
| **类型** | Migration 种子数据 | 参考文档 |
| **应该执行** | ✅ 是（创建测试数据） | ❌ 否（参考用） |
| **语句状态** | 大部分可直接执行 | 大部分已注释 |
| **用途** | 创建初始测试数据 | 学习参考 |
| **重点** | 完整流程（商户→场地→邀请码） | 详细操作示例 |

---

## 推荐使用方式

### 方式 1: 首次创建测试数据（推荐）

使用 `015_seed_example.sql`:

```sql
-- 1. 在 Supabase Dashboard SQL Editor 中打开 015_seed_example.sql
-- 2. 执行步骤 1 的 DO 块（创建商户并设置 owner）
-- 3. 执行步骤 3 的 RPC 调用（创建邀请码）
```

### 方式 2: 学习邀请码操作

查看 `create_invite_code.sql`:

```sql
-- 1. 查看文件中的示例和说明
-- 2. 复制需要的代码段
-- 3. 修改 UUID 和参数
-- 4. 取消注释后执行
```

### 方式 3: 在生产环境创建邀请码（推荐）

使用 RPC 函数（两个文件都推荐）:

```sql
-- 在应用中使用，或直接在 SQL Editor 中调用
SELECT public.create_invite_code(
  'YOUR_MERCHANT_ID',     -- merchant_id
  NULL,                    -- venue_id (NULL = 所有场地)
  'staff',                 -- role (小写)
  10,                      -- max_uses
  30                       -- expires_days
);
```

---

## 总结

- **`015_seed_example.sql`**: 执行这个文件来创建测试数据
- **`create_invite_code.sql`**: 查看这个文件来学习各种操作方式

**最佳实践**: 
1. 执行 `015_seed_example.sql` 创建初始数据
2. 参考 `create_invite_code.sql` 学习更多操作
3. 在生产环境使用 RPC 函数 `create_invite_code`
