# Error Codes Reference

> CodeHub CLI错误码参考文档。
> 区分HTTP响应码和API错误码，帮助诊断问题。

## 响应码与错误码区分

### HTTP响应码

HTTP响应码是HTTP协议定义的标准状态码，表示请求处理结果：

| 响应码 | 类别 | 含义 |
|--------|------|------|
| 200 | 成功 | 请求成功 |
| 201 | 成功 | 创建成功 |
| 400 | 客户端错误 | 请求参数错误 |
| 401 | 客户端错误 | 未认证/认证失败 |
| 403 | 客户端错误 | 权限不足 |
| 404 | 客户端错误 | 资源不存在 |
| 409 | 客户端错误 | 冲突 |
| 429 | 客户端错误 | 请求过多 |
| 500 | 服务器错误 | 内部错误 |
| 503 | 服务器错误 | 服务不可用 |

**用途：** 提供初步诊断方向，由HTTP协议定义。

### API错误码

API错误码是CodeHub服务定义的业务错误码，标识具体业务逻辑错误：

```
CH.XXXXXXXX
```

**格式：** `云服务简写.微服务编号+模块编号+业务错误码`

**用途：** 精确标识具体业务错误，由CodeHub API定义。

## 错误码格式详解

```
CH.XXXXXXXX
```

结构分解：
- `CH` = 云服务简写（CodeHub）
- `XXX` = 微服务编号（3位数字，001-999）
- `XX` = 模块编号（2位数字，00-99）
- `XXX` = 业务错误编号（3位数字，000-999）

### 组成规则

| 组成部分 | 格式 | 说明 |
|----------|------|------|
| 云服务简写 | 2-4字母 | CodeHub服务简写为`CH` |
| 微服务编号 | 3位数字 | 由微服务编号对照表指定 |
| 模块编号 | 2位数字 | 由各微服务内模块编号对照表指定 |
| 错误编号 | 3位数字 | 微服务团队根据业务需求制定 |

### 模块编号规则

- `00` = 系统类异常
- `01` = 公共通用异常
- `02-99` = 各业务模块（从02开始）

公共通用错误码示例：

| 错误码 | 含义 | 常见场景 |
|--------|------|----------|
| `CH.00401000` | Illegal parameter | 参数非法 |
| `CH.00401001` | Unauthorized access | 未授权访问 |
| `CH.00401002` | Error code not found | 错误码未找到 |
| `CH.00401003` | Could not parse 'Accept' header | Accept头解析失败 |
| `CH.00401004` | Check sensitive words failed | 敏感词检查失败 |
| `CH.00401005` | Contains sensitive words | 包含敏感词 |
| `CH.00401006` | Operation is forbidden | 操作被禁止 |
| `CH.00401007` | Parameter is error | 参数错误 |
| `CH.00401008` | Unauthorized access | 未授权访问 |
| `CH.00401009` | Account has been blocked | 账户被封禁 |
| `CH.00401010` | Collection is empty | 集合为空 |
| `CH.00401011` | Failed to obtain the byte stream | 获取字节流失败 |
| `CH.00401012` | encoding mismatch | 编码不匹配 |
| `CH.00401013` | Illegal file path | 文件路径非法 |
| `CH.00401014` | 404 Not found | 资源不存在 |
| `CH.00401015` | Params must at least one exist | 参数至少需要一个 |
| `CH.00401016` | Request Timeout | 请求超时 |
| `CH.00401017` | Paging offset exceeds max value | 分页偏移超出最大值 |
| `CH.00401019` | Description exceeds character limit | 描述超出字符限制 |
| `CH.00401100` | Too many request | 请求过多 |
| `CH.00401101` | Storage readonly | 存储只读 |
| `CH.00401102` | Storage unavailable | 存储不可用 |
| `CH.00401999` | Param validate failed | 参数验证失败 |

## 错误码解析示例

### 示例：CH.00402003

解析：
- `CH` = CodeHub云服务
- `004` = projectsvr微服务
- `02` = project模块
- `003` = 业务错误编号003

含义：projectsvr微服务project模块的第3号业务错误。

### 示例：CH.00405114

解析：
- `CH` = CodeHub云服务
- `004` = projectsvr微服务
- `05` = merge_request模块
- `114` = 业务错误编号114

含义：projectsvr微服务merge_request模块的第114号业务错误（MR模板不存在）。

## 错误响应结构

API返回两种错误响应格式：

### CodehubProjectError格式

```json
{
  "code": "CH.00401001",
  "title": "Unauthorized access",
  "message": "Unauthorized access",
  "solution": "",
  "wiki": ""
}
```

### CodehubAPIError格式

```json
{
  "errorCode": "CH.00401001",
  "errorMsg": "Unauthorized access"
}
```

## CLI错误输出格式

CLI统一使用JSON格式输出错误：

```json
{
  "status": "error",
  "code": 401,
  "message": "CH.00401001: Unauthorized access"
}
```

- `status`: 固定为"error"
- `code`: HTTP响应码（用于CLI内部处理）
- `message`: 包含API错误码(CH.XXXXXXXX)和错误消息

## 诊断工作流

```
收到错误响应?
    │
    ├── 查看HTTP响应码（初步方向）
    │   │
    │   ├── 401 → 认证问题
    │   ├── 403 → 权限问题
    │   ├── 404 → 资源不存在
    │   ├── 400 → 参数错误
    │   └── 500 → 服务器错误
    │
    ├── 查看API错误码（精确诊断）
    │   │
    │   ├── 解析微服务编号 → 确定来源微服务
    │   ├── 解析模块编号 → 确定业务模块
    │   └── 查错误码表 → 确定具体错误
    │
    └── 根据错误消息采取对应措施
```

## 常见错误场景

### 认证相关（HTTP 401）

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401001` | Unauthorized access | 检查认证状态，重新登录 |
| `CH.00401008` | Unauthorized access | 检查认证状态，重新登录 |
| `CH.00401009` | Account has been blocked | 账户被封禁，联系管理员 |

**检查认证状态:**
```bash
codehub-cli auth status
codehub-cli auth login --w3 --all
```

### 权限相关（HTTP 403）

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401006` | Operation is forbidden | 确认项目权限，联系项目管理员 |

### 资源不存在（HTTP 404）

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401014` | 404 Not found | 检查资源ID是否正确 |

**验证资源存在:**
```bash
codehub-cli mr list -p org/repo --columns iid,title
codehub-cli issue list -p org/repo --columns iid,title
```

### 参数错误（HTTP 400）

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401000` | Illegal parameter | 使用`--help`查看参数要求 |
| `CH.00401007` | Parameter is error | 检查参数格式和约束 |
| `CH.00401013` | Illegal file path | 检查文件路径格式 |
| `CH.00401015` | Params must at least one exist | 提供至少一个必需参数 |
| `CH.00401019` | Description exceeds character limit | 缩短描述内容 |
| `CH.00401999` | Param validate failed | 检查参数验证规则 |

### 请求限制（HTTP 429）

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401100` | Too many request | 降低请求频率，等待后重试 |

### 服务器错误（HTTP 500）

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401101` | Storage readonly | 存储只读，联系管理员 |
| `CH.00401102` | Storage unavailable | 存储不可用，等待恢复 |

### 其他错误

| 错误码 | 含义 | 解决方案 |
|--------|------|----------|
| `CH.00401005` | Contains sensitive words | 移除敏感词内容 |
| `CH.00401016` | Request Timeout | 减少请求数据量或重试 |
| `CH.00401017` | Paging offset exceeds max value | 减小分页偏移值 |

## 最佳实践

### 遇到错误时的处理步骤

1. **查看HTTP响应码** - 确定初步诊断方向
2. **解析API错误码** - 确定微服务、模块、具体错误
3. **阅读错误消息** - 获取详细错误描述
4. **查阅错误码表** - 确认错误含义和解决方案
5. **采取对应措施** - 根据错误类型执行恢复操作

### 预防常见错误

```bash
# 执行操作前验证认证
codehub-cli auth status

# 执行操作前验证项目
codehub-cli project view -p org/repo

# 执行操作前验证资源存在
codehub-cli mr view <mr-iid> -p org/repo
codehub-cli issue view <issue-iid> -p org/repo

# 查看命令参数要求
codehub-cli <command> --help
```

## 参考链接

- 错误处理源码: `internal/output/output.go` - `APIErrCode()`函数
- 错误响应结构: `CodehubProjectError` 和 `CodehubAPIError`
- API规范: `openapi3.yaml` - `FailedRef` 结构定义