# 熟人约局系统 — 技术设计文档

## 1. 技术目标

将现有单一羽毛球场次预约系统升级为多活动约局系统，同时保持轻量部署、无框架前端和 PocketBase 后端。

设计重点：

- 用统一活动模型承载不同活动类型。
- 用活动类型模板描述差异字段。
- 保持空间级数据隔离。
- 保持取消码和分享链接机制简单可靠。

## 2. 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | 原生 HTML / CSS / JavaScript |
| 后端 | PocketBase |
| 数据库 | SQLite |
| 部署 | 单机部署，Nginx 反向代理可选 |

## 3. 数据模型

### 3.1 spaces

空间表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | PocketBase 自动生成 |
| name | text | 空间展示名，可选 |
| key_hash | text | 空间密钥哈希 |
| status | select | active / disabled |
| created | datetime | 创建时间 |
| updated | datetime | 更新时间 |

索引：

- `key_hash` 唯一索引
- `status` 普通索引

### 3.2 activity_types

活动类型模板表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | PocketBase 自动生成 |
| key | text | 类型稳定标识，如 badminton |
| name | text | 展示名，如羽毛球 |
| icon | text | lucide 图标名 |
| enabled | bool | 是否启用 |
| sort_order | number | 排序 |
| fields_schema | json | 专属字段定义 |
| card_schema | json | 卡片展示规则，可选 |
| detail_schema | json | 详情展示规则，可选 |
| created | datetime | 创建时间 |
| updated | datetime | 更新时间 |

`fields_schema` 示例：

```json
[
  {
    "key": "court_count",
    "label": "场地数量",
    "type": "number",
    "required": true,
    "show_in_detail": true
  },
  {
    "key": "level",
    "label": "水平要求",
    "type": "text",
    "required": false,
    "show_in_detail": true
  }
]
```

建议预置类型：

- badminton
- basketball
- murder_mystery
- boardgame
- other

### 3.3 events

活动表。建议新建 `events`，逐步替代旧 `sessions`。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | PocketBase 自动生成 |
| space | relation | 关联 spaces |
| type | relation | 关联 activity_types |
| title | text | 活动标题 |
| date | date | 活动日期 |
| start_time | text | 开始时间，格式 HH:mm |
| end_time | text | 结束时间，格式 HH:mm |
| venue | text | 活动地点 |
| fee | text | 费用，允许 0、AA、45 元等表达 |
| max_players | number | 人数上限 |
| organizer | text | 发布人 |
| cancel_code_hash | text | 活动取消码哈希 |
| note | text | 备注 |
| custom_fields | json | 类型专属字段值 |
| status | select | active / cancelled |
| created | datetime | 创建时间 |
| updated | datetime | 更新时间 |

索引：

- `space, date, start_time`
- `space, type`
- `space, status`

### 3.4 signups

报名表。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | PocketBase 自动生成 |
| event | relation | 关联 events |
| name | text | 报名者昵称 |
| cancel_code_hash | text | 报名取消码哈希 |
| status | select | active / cancelled |
| created | datetime | 报名时间 |
| updated | datetime | 更新时间 |

索引：

- `event, status`
- `created`

### 3.5 audit_logs

审计日志，可作为后台增强能力。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | PocketBase 自动生成 |
| space | relation | 关联 spaces，可选 |
| event | relation | 关联 events，可选 |
| action | text | create_event / signup / cancel_signup / cancel_event 等 |
| actor_name | text | 操作者昵称，可选 |
| ip_hash | text | IP 哈希，可选 |
| metadata | json | 额外上下文 |
| created | datetime | 创建时间 |

## 4. 前端页面结构

建议文件逐步调整为：

```text
public/
├── index.html          # 进入空间
├── space.html          # 活动列表
├── event.html          # 活动详情
├── new.html            # 发布活动：选择类型 + 填写信息
├── admin.html          # 后台入口 / 空间列表
├── admin-space.html    # 后台空间详情
├── admin-types.html    # 活动类型管理
├── admin-events.html   # 后台活动列表
├── lib/api.js          # API 封装
└── style.css           # 公共样式
```

如果短期不想拆太多文件，发布活动的两个步骤可以先在 `new.html` 内通过状态切换实现。

## 5. API 设计

PocketBase 原生 CRUD 可以满足基础能力，但涉及密钥、取消码和分享链接时建议通过 `pb_hooks` 封装自定义接口。

### 5.1 空间接口

#### POST `/api/spaces/enter`

请求：

```json
{
  "key": "thursday-friends"
}
```

响应：

```json
{
  "spaceId": "xxx",
  "spaceToken": "encrypted-token"
}
```

说明：

- 后端对 key 做哈希后查询空间。
- 前端只保存短期 token，不保存明文 key。

#### POST `/api/spaces/create`

请求：

```json
{
  "createPassword": "server-config-password",
  "key": "thursday-friends",
  "name": "周四朋友局"
}
```

### 5.2 活动类型接口

#### GET `/api/activity-types`

返回启用的活动类型模板，用于发布活动表单渲染。

### 5.3 活动接口

#### GET `/api/events?spaceToken=...&type=badminton`

返回当前空间活动列表。

#### GET `/api/events/:id?shareToken=...`

返回活动详情和报名列表。

#### POST `/api/events`

创建活动。

请求示例：

```json
{
  "spaceToken": "xxx",
  "typeKey": "badminton",
  "title": "周六 19:00 双打",
  "date": "2026-05-02",
  "startTime": "19:00",
  "endTime": "21:00",
  "venue": "市民中心球馆 B 区",
  "fee": "45 元",
  "maxPlayers": 12,
  "organizer": "阿伦",
  "cancelCode": "1234",
  "note": "建议自带球拍",
  "customFields": {
    "court_count": 3,
    "level": "中级友好",
    "equipment": "自带球拍"
  }
}
```

#### PATCH `/api/events/:id`

修改活动。必须提供活动取消码。

#### POST `/api/events/:id/cancel`

取消活动。必须提供活动取消码。

### 5.4 报名接口

#### POST `/api/events/:id/signups`

请求：

```json
{
  "name": "小林",
  "cancelCode": "abcd"
}
```

校验：

- 活动存在且未取消。
- 活动未过期。
- 当前 active 报名数小于 max_players。

#### POST `/api/signups/:id/cancel`

请求：

```json
{
  "cancelCode": "abcd"
}
```

## 6. 分享链接设计

分享链接格式建议：

```text
/event.html?s=<share_token>
```

`share_token` 加密内容：

```json
{
  "spaceId": "xxx",
  "eventId": "yyy",
  "exp": 1893456000
}
```

要求：

- 不包含空间密钥明文。
- 使用服务端密钥签名或加密。
- 后端解析 token 后校验空间和活动关系。

## 7. 表单渲染设计

前端发布活动流程：

1. 获取 `/api/activity-types`。
2. 用户选择类型。
3. 渲染公共字段。
4. 根据 `fields_schema` 渲染专属字段。
5. 提交时将专属字段打包到 `customFields`。

字段类型建议第一版支持：

- text
- number
- boolean
- select
- textarea

## 8. 迁移方案

当前系统已有 `sessions` 概念，建议分两步迁移：

### 阶段一：兼容迁移

- 新建 `activity_types`。
- 新建 `events`。
- 保留旧 `sessions` 表。
- 写一次性迁移脚本，将旧 `sessions` 转为 `events`，类型设为 `badminton`。
- 前端改读 `events`。

### 阶段二：清理旧表

- 确认线上数据迁移无误。
- 停止写入旧 `sessions`。
- 删除旧接口或保留只读兼容。

## 9. 安全设计

- 空间密钥使用哈希保存。
- 活动取消码和报名取消码使用哈希保存。
- 分享 token 使用服务端密钥签名或加密。
- 后台接口需要管理员认证。
- 前台接口必须校验空间 token 或分享 token。
- 取消活动、修改活动、取消报名都必须校验取消码。

## 10. 状态计算

活动状态由字段和时间共同决定：

- cancelled：活动已取消。
- expired：当前时间晚于活动结束时间。
- full：active 报名数大于等于 max_players。
- open：可报名。

建议不要把 `expired/full/open` 都持久化，只在查询时计算。数据库只保存 `active/cancelled`。

## 11. 实施顺序

1. 新增 `activity_types` 和 `events` 数据结构。
2. 写旧 `sessions` 到新 `events` 的迁移。
3. 更新 API 封装，统一使用 event 概念。
4. 改造前台：活动列表、详情、发布活动。
5. 改造后台：活动类型管理、活动列表、空间详情。
6. 补充端到端测试：发布不同类型活动、报名、满员、分享直达。

## 12. 测试重点

- 不同空间数据隔离。
- 分享链接不暴露密钥且可直达活动。
- 不同活动类型的专属字段能正确保存和展示。
- 满员后不能报名。
- 过期后不能报名和修改。
- 取消码错误时不能取消报名或活动。
- 手机端发布活动无横向滚动。
