# Quick Type

把 API 响应或 JSON 样本转成 TypeScript 类型定义。字段名保持 JSON 原样，接口名使用大驼峰。

## 功能

- 请求 URL，支持 GET、POST、PUT、PATCH、DELETE，以及自定义请求头和 JSON 请求体
- 直接粘贴 JSON。单引号、注释、末尾逗号和未加引号的字段名会整理成标准 JSON
- 用 quicktype-core 推断类型，包含数组中的不同样本、`null` 和可选字段
- 复制结果，或保存到当前用户主目录下的 `.ts` 文件

## 技术栈

- 前端：Vite、React、TypeScript，开发地址带有 `/quick-type/` 前缀
- 后端：Express、quicktype-core，默认端口 `8787`
- 仓库：pnpm workspace，`front` 和 `backend` 各自保留自己的 TypeScript 配置
- 部署：Docker Compose。Nginx 提供页面并转发 `/api`，Node 运行后端

## 目录

```
quick-type-main/
├── front/                 # React 前端
├── backend/               # Express 后端
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## 本地开发

需要 Node.js 22 和 pnpm 10。

```bash
pnpm install

# 同时启动前端和后端
pnpm dev
```

也可以分开启动：

```bash
pnpm dev:backend
pnpm dev:front
```

- 前端：http://localhost:3000/quick-type/
- 后端：http://localhost:8787
- 健康检查：http://localhost:8787/health

`front/.env`：

```bash
VITE_API_URL=http://localhost:8787
VITE_SITE_URL=https://1996tsk.top/quick-type
```

`VITE_API_URL` 是浏览器请求后端的地址。`VITE_SITE_URL` 用于页面的 canonical 和分享信息，可以写域名，也可以写已经带 `/quick-type` 的页面地址。

## Docker 部署

在仓库根目录执行：

```bash
docker compose up -d --build
```

- 页面：宿主机 `8080` 端口，路径 `/quick-type/`。容器内的 Nginx 仍监听 `80`
- 接口：页面请求当前域名下的 `/quick-type/api`。容器里的 Nginx 把它转到后端。服务器前面的 HTTPS 代理也要把 `/quick-type/` 转到 `8080`
- 保存的类型文件位于数据卷中的 `/home/node/quick-type-types`

`VITE_API_URL` 会写进前端构建结果。默认是 `/quick-type`，这样页面在哪个域名打开，接口就打到哪个域名。改过这个值之后需要重新构建 `web` 镜像。

## 使用

1. 输入 API 地址，或切换到「粘贴 JSON」。
2. GET 直接读取响应。POST、PUT、PATCH 可以附带 JSON 请求体。需要认证时再添加请求头。
3. 点击「生成类型」。可以复制结果，或保存到主目录下的 `.ts` 文件。

粘贴下面的样本会得到数组元素类型，以及数组本身的别名：

```json
[
  { "id": 1, "user_name": "Ada", "nickname": null },
  { "id": 2, "user_name": "Grace", "nickname": "grace", "email": "grace@example.com" }
]
```

```typescript
export interface SampleResponseItem {
  id: number;
  user_name: string;
  nickname: null | string;
  email?: string;
}

export type SampleResponse = SampleResponseItem[];
```

## API

### POST /api/generate-types

`url` 和 `json` 至少提供一个。

```json
{
  "url": "https://jsonplaceholder.typicode.com/users",
  "json": "{\"id\":1}",
  "method": "GET",
  "headers": { "Authorization": "Bearer token" },
  "body": "{\"name\":\"Ada\"}",
  "rootTypeName": "UsersResponse",
  "saveToFile": false,
  "fileName": "UsersTypes.ts",
  "savePath": "~/quick-type-types"
}
```

成功时返回 `types`。请求了 URL 时还会返回 `originalData`。勾选保存时返回 `fileInfo`。

### POST /api/save-types

保存已经生成的源码，不再请求目标 URL。`savePath` 必须位于运行后端的用户主目录内。

```json
{
  "types": "export interface User { id: number }\n",
  "fileName": "UserTypes.ts",
  "savePath": "~/quick-type-types"
}
```

### GET /health

返回 `{ "status": "ok" }`。

### GET /api/system-info

返回主目录和默认保存路径。

## 许可证

MIT
