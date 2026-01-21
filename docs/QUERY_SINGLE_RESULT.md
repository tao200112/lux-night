# 单查询结果使用指南

## 🎯 问题
Supabase SQL Editor 一次只能显示一个查询的结果，无法一次性查看多个查询的结果。

## ✅ 解决方案

我创建了三个版本的查询文件，都可以一次性执行并返回单个结果：

### 方案 1: 统一表格格式（推荐）
**文件**: `docs/quick-query-single.sql`

- ✅ 所有信息合并到一个表格中
- ✅ 第一列是"类别"，用于区分不同类型的信息
- ✅ 使用 `【1. 表列表】` 这样的标记区分不同部分
- ✅ 可以直接复制整个表格

**使用方法**:
1. 复制 `docs/quick-query-single.sql` 的全部内容
2. 在 SQL Editor 中粘贴并执行
3. 复制整个结果表格

**输出格式**:
```
类别              | 项目1        | 项目2      | 项目3    | ...
【1. 表列表】     | profiles     | postgres   |          | ...
【2. 表列信息】   | profiles     | id         | uuid     | ...
【4. 外键】       | profiles.id  | →          | auth...  | ...
```

---

### 方案 2: JSON 格式
**文件**: `docs/quick-query-json.sql`

- ✅ 返回单个 JSON 对象
- ✅ 结构清晰，易于解析
- ✅ 可以复制整个 JSON 文本
- ✅ 适合程序处理

**使用方法**:
1. 复制 `docs/quick-query-json.sql` 的全部内容
2. 在 SQL Editor 中粘贴并执行
3. 复制 JSON 结果（通常是单个单元格）

**输出格式**:
```json
{
  "tables": [...],
  "columns": [...],
  "foreign_keys": [...],
  "rls_policies": [...],
  ...
}
```

---

### 方案 3: UNION ALL 合并（备选）
**文件**: `docs/quick-query-unified.sql`

- ✅ 使用 UNION ALL 合并所有查询
- ✅ 统一列结构
- ✅ 单表输出

---

## 📋 推荐使用流程

### 步骤 1: 选择查询文件
- **推荐**: `docs/quick-query-single.sql`（表格格式，最易读）
- **备选**: `docs/quick-query-json.sql`（JSON 格式，适合程序处理）

### 步骤 2: 执行查询
1. 打开 Supabase Dashboard → SQL Editor
2. 复制选中的 SQL 文件全部内容
3. 粘贴到 SQL Editor
4. 点击 "Run" 或按 `Ctrl+Enter`

### 步骤 3: 复制结果
- **表格格式**: 选中整个表格，复制（Ctrl+C）
- **JSON 格式**: 选中 JSON 文本，复制（Ctrl+C）

### 步骤 4: 保存结果
- 粘贴到文本文件或 Excel
- 或直接保存为 `.sql` 文件（用于后续参考）

---

## 💡 技巧

### 技巧 1: 在 Excel 中查看
1. 复制表格结果
2. 粘贴到 Excel
3. 使用筛选功能，按"类别"列筛选
4. 可以清晰地查看每个部分

### 技巧 2: 导出为 CSV
- 在 SQL Editor 结果区域右键
- 选择 "Export" → "CSV"
- 下载后用 Excel 打开

### 技巧 3: JSON 格式处理
- 复制 JSON 结果
- 粘贴到 JSON 格式化工具（如 jsonformatter.org）
- 或使用代码编辑器（VS Code）自动格式化

---

## 🔍 查询内容说明

### `quick-query-single.sql` 包含：
1. ✅ 【1. 表列表】- 所有表名和所有者
2. ✅ 【2. 表列信息】- 所有表的列信息（表名、列名、类型、可空性、默认值）
3. ✅ 【3. 主键】- 所有主键约束
4. ✅ 【4. 外键】- 所有外键关系
5. ✅ 【5. 唯一约束】- 所有唯一约束
6. ✅ 【6. 索引】- 所有索引
7. ✅ 【7. RLS策略】- 所有 RLS 策略
8. ✅ 【8. 函数】- 所有函数
9. ✅ 【9. 触发器】- 所有触发器
10. ✅ 【10. 表大小】- 表大小统计
11. ✅ 【11. 表行数】- 表行数统计

### `quick-query-json.sql` 包含：
- 所有上述信息，以 JSON 格式组织

---

## 📁 文件列表

- `docs/quick-query-single.sql` - **推荐**：表格格式，单查询输出
- `docs/quick-query-json.sql` - JSON 格式，单查询输出
- `docs/quick-query-unified.sql` - UNION ALL 合并格式
- `docs/QUERY_SINGLE_RESULT.md` - 本说明文件

---

## ⚠️ 注意事项

1. **查询时间**: 单查询可能比多个查询稍慢，请耐心等待
2. **结果大小**: 如果表很多，结果可能很长
3. **内存**: JSON 格式可能占用较多内存
4. **格式**: 表格格式在 SQL Editor 中显示最佳

---

## 🆘 遇到问题？

### 查询超时
- 尝试使用简化版查询
- 或分段查询（只查询需要的部分）

### 结果太长
- 使用导出功能（CSV）
- 或使用 JSON 格式，然后用工具格式化

### 格式混乱
- 表格格式在 SQL Editor 中显示最佳
- JSON 格式需要格式化工具查看
