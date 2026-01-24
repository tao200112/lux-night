# Timezone Column Error Fix Report

## 问题描述
POST `/api/admin/merchants` 报错：`column "timezone" does not exist`

## 根因分析
1. **数据库 schema 确认：** `merchants` 表不包含 `timezone` 字段
   - 有效字段：`id`, `region_id`, `name`, `status`, `created_at`, `updated_at`, `default_venue_id`
2. **可能的原因：** 前端请求 body 中包含了 `timezone` 字段，但代码没有过滤它

## 修复内容

### 1. 白名单字段映射（Line 284-320）
- **修改前：** 直接解构 `body`，可能包含未知字段
- **修改后：** 明确提取白名单字段，并明确忽略 `timezone`
```typescript
const { merchantId, regionId, role, expiresDays, timezone, ...otherFields } = body;
```

### 2. 添加警告日志（Line 320-340）
- 如果请求体包含 `timezone`，记录警告日志（但不阻止请求）
- 如果请求体包含其他未知字段，记录警告日志

### 3. 白名单字段映射 merchantInsertPayload（Line 451-460）
- **修改前：** 手动构造 payload（已经是白名单，但不够明确）
- **修改后：** 添加类型注解和注释，明确只包含数据库真实存在的列
```typescript
const merchantInsertPayload: {
  name: string;
  region_id: string;
  status: string;
} = {
  name: merchantName,
  region_id: regionId,
  status: 'active',
};
```

### 4. 添加临时日志（Line 462-467）
- 在 insert 前添加 `console.log({ step: 'merchant.insert.payload', payload: merchantInsertPayload })`
- 用于验证 payload 不包含 `timezone`

## 修复验证

### 预期行为
1. **如果请求体包含 timezone：**
   - 记录警告日志：`Request body contains timezone field (will be ignored)`
   - `merchantInsertPayload` 不包含 `timezone`
   - 插入成功，返回 200

2. **如果请求体不包含 timezone：**
   - 正常处理，插入成功，返回 200

3. **返回的 invite.merchantId：**
   - 必须等于新创建的 `merchant.id`（不是 null）

### 日志验证点
1. `step: 'request.body'` - 检查是否包含 `timezone`
2. `step: 'request.body.validation'` - 检查警告日志
3. `step: 'merchant.insert.payload'` - 验证 payload 不包含 `timezone`
4. `step: 'merchant.created'` - 验证 merchant 创建成功
5. `step: 'invite.created'` - 验证 invite.merchantId 等于 merchant.id

## 修改的文件
- `apps/admin-web/app/api/admin/merchants/route.ts`
  - Line 284-340: 白名单字段映射和警告日志
  - Line 451-467: merchantInsertPayload 白名单和临时日志

## 禁止事项（已遵守）
- ✅ 不改数据库 schema
- ✅ 不把 timezone 改名猜测写入
- ✅ 不 try/catch 吞掉错误
- ✅ 禁止直接 spread body 进 insert
- ✅ 使用白名单字段映射

## 测试步骤
1. 调用 POST `/api/admin/merchants` with:
   ```json
   {
     "regionId": "valid-region-uuid",
     "role": "owner",
     "expiresDays": 30,
     "timezone": "America/New_York"  // 测试包含 timezone
   }
   ```

2. 检查 Vercel 日志：
   - 应该看到警告：`Request body contains timezone field (will be ignored)`
   - `merchant.insert.payload` 不应该包含 `timezone`
   - 应该返回 200，`invite.merchantId` 应该等于新创建的 `merchant.id`

3. 再次调用（不包含 timezone）：
   ```json
   {
     "regionId": "valid-region-uuid",
     "role": "owner",
     "expiresDays": 30
   }
   ```
   - 应该正常处理，返回 200
