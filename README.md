# 羽毛球场地预约系统

一个轻量级的羽毛球场地信息共享与报名网站，供朋友圈内部使用，无需注册登录。

## 功能

- 查看当前已预订的场次（时间、地点、费用、人数等）
- 发布新场次
- 报名参加场次
- 查看各场次报名名单

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 原生 HTML / CSS / JS | 无框架，轻量 |
| 后端 | [PocketBase](https://pocketbase.io) | 单二进制，自带 SQLite + REST API |
| 数据库 | SQLite（PocketBase 内置） | 无需单独安装 |

## 项目结构

```
badminton/
├── pb/                  # PocketBase 可执行文件
├── pb_data/             # SQLite 数据库及配置（运行后自动生成，不提交 git）
├── public/              # 前端静态文件
│   ├── index.html       # 首页：场次列表
│   ├── detail.html      # 场次详情 + 报名
│   ├── new.html         # 发布新场次
│   ├── main.js          # 公共 JS（PocketBase SDK 调用）
│   └── style.css        # 样式
└── README.md
```

## 数据结构

### sessions（场次）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 自动生成 |
| date | date | 打球日期 |
| start_time | string | 开始时间，如 `19:00` |
| end_time | string | 结束时间，如 `21:00` |
| venue | string | 场地名称 |
| court_count | number | 场地数量 |
| fee | number | 每人费用（元） |
| max_players | number | 人数上限 |
| note | text | 备注（可选） |
| created | datetime | 自动生成 |

### signups（报名）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 自动生成 |
| session | relation | 关联 sessions |
| name | string | 报名者姓名 |
| created | datetime | 报名时间，自动生成 |

## 启动方式

```bash
# 下载 PocketBase（Linux amd64）
cd pb/
./pocketbase serve --http="0.0.0.0:8090"
```

访问：
- 前端页面：`http://your-server-ip:8090`（静态文件由 PocketBase 托管）
- 管理后台：`http://your-server-ip:8090/_/`

## 部署

推荐使用 Nginx 反向代理 + 域名，或直接暴露端口供内部使用。
