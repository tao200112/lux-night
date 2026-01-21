# SQL Editor 查询使用说明

## 🎯 目标
在 Supabase Dashboard SQL Editor 中一次性执行所有查询，然后复制全部结果。

---

## 📋 使用方法

### 方法 1: 完整版查询（推荐）

1. **打开 Supabase Dashboard**
   - 登录: https://supabase.com/dashboard
   - 选择项目 → SQL Editor

2. **复制完整查询**
   - 打开 `docs/quick-query.sql`
   - 全选并复制所有内容（Ctrl+A, Ctrl+C）

3. **执行查询**
   - 粘贴到 SQL Editor
   - 点击 "Run" 或按 `Ctrl+Enter`

4. **复制结果**
   - 查询结果会显示在下方
   - 点击结果区域，全选（Ctrl+A），复制（Ctrl+C）
   - 或右键 → "Copy" → "Copy all"

### 方法 2: 简化版查询（快速）

如果只需要核心信息，使用 `docs/quick-query-simple.sql`

---

## 📊 查询内容说明

### 完整版包含：
1. ✅ 所有表列表
2. ✅ 所有表的列信息（完整结构）
3. ✅ 表统计信息（列数）
4. ✅ 主键约束
5. ✅ 外键约束（完整关系）
6. ✅ 唯一约束
7. ✅ 索引信息
8. ✅ RLS 策略（摘要）
9. ✅ RLS 策略详情（完整表达式）
10. ✅ 函数列表
11. ✅ 触发器信息
12. ✅ 表大小统计
13. ✅ 表行数统计
14. ✅ CHECK 约束
15. ✅ 表关系图（外键关系）

### 简化版包含：
1. ✅ 所有表列表
2. ✅ 核心表结构（8个关键表）
3. ✅ 外键关系
4. ✅ RLS 策略
5. ✅ 函数列表
6. ✅ 触发器信息
7. ✅ 表行数统计

---

## 💡 复制结果的技巧

### 技巧 1: 使用表格视图
- SQL Editor 默认显示表格视图
- 可以直接选中表格，复制（Ctrl+C）
- 粘贴到 Excel 或 Google Sheets 中查看

### 技巧 2: 导出为 CSV
- 在结果区域右键
- 选择 "Export" → "CSV"
- 下载后可以用 Excel 打开

### 技巧 3: 复制为文本
- 选中结果区域
- 复制（Ctrl+C）
- 粘贴到文本编辑器
- 格式会保持表格结构

### 技巧 4: 分段复制
- 如果结果太长，可以分段复制
- 每个查询结果之间用分隔符（`===`）区分
- 按顺序复制每个部分

---

## 🔧 自定义查询

### 只查询特定表的结构
```sql
-- 替换 'profiles' 为你想查询的表名
SELECT 
    column_name AS "列名",
    data_type AS "类型",
    is_nullable AS "可空",
    column_default AS "默认值"
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'profiles'  -- 修改这里
ORDER BY ordinal_position;
```

### 只查询外键关系
```sql
SELECT
    tc.table_name || '.' || kcu.column_name AS "表.列",
    ccu.table_name || '.' || ccu.column_name AS "引用表.列"
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

---

## ⚠️ 注意事项

1. **查询时间**: 完整版查询可能需要几秒钟，请耐心等待
2. **结果大小**: 如果表很多，结果可能很长，建议分段查看
3. **权限**: 确保使用 `postgres` 用户或有足够权限的账户
4. **网络**: 确保网络连接稳定

---

## 📁 相关文件

- `docs/quick-query.sql` - 完整版查询（15个部分）
- `docs/quick-query-simple.sql` - 简化版查询（7个部分）
- `docs/QUERY_INSTRUCTIONS.md` - 本说明文件

---

## 🆘 遇到问题？

### 查询超时
- 尝试使用简化版查询
- 或分段执行查询

### 结果太长无法复制
- 使用导出功能（CSV）
- 或分段复制每个部分

### 某些查询失败
- 检查权限设置
- 检查表是否存在
- 查看错误信息
