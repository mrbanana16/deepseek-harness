---
description: "在设置上方显示 DeepSeek API key 余额，支持手动刷新和低余额颜色提示。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-api-balance

[English](README.md) | 中文

## 概述

用户可以在设置上方查看 DeepSeek API key 余额，并通过图标按钮刷新。页面首次确定使用 DeepSeek 官方供应商时查询一次。金额正常显示绿色，低于 ¥1 时显示橙色，低于 ¥0.10 时显示红色；其他状态显示本地化的获取中、获取失败或不支持获取提示。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

Web 应用组合默认启用余额条目。自定义组合需将此插件与侧栏、语言、渲染器、Session Remote、设置、凭据及 LLM 服务一起挂载：

```yaml
- id: ui-api-balance
  name: '@deepseek-ai/dsh-client-ui-api-balance'
  config:
    timeoutMs: 10000
```

金额包含赠送额度和充值额度。每次查询时，Host 会确定当前启用的 `deepseek-official` 供应商的设置命名空间，并解析其 `apiKeyEnv` 凭据引用。Host 使用 Bearer 认证调用[官方余额 API](https://api-docs.deepseek.com/api/get-user-balance/)；浏览器只接收金额或状态。使用其他源的自定义端点不支持获取余额。

条目跟随当前会话选择的供应商；没有选择会话时使用配置的默认供应商。切换到其他供应商会显示不支持获取，切换回来会恢复本页缓存的结果。手动刷新会再次查询，也适用于获取失败或凭据变化后。SVG 金钱轮廓图标使用共享图标线宽及主题颜色，适配浅色和深色模式。折叠侧栏后保留可点击刷新的金钱图标，并通过提示浮层和无障碍名称提供余额。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `timeoutMs` | `10000` | 官方 HTTP 请求及响应读取的最长时间。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

Host 服务负责凭据解析、官方源检查、JSON 验证及请求取消。浏览器模型保留本页的一次查询结果，并共享正在进行的刷新。浏览器消费者在挂载生成的 Remote 贡献后声明其 `remote.apiBalance` 依赖。插件将可观察结果绑定到框架 Hook，通过 `sidebar.footer.action` 提供条目；侧栏负责将其放在设置上方。插件卸载时移除条目、取消未完成请求，并等待其结束。供应商选择投影及配置通知只更新显示策略，不轮询余额。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Web Client 架构](../../../docs/subsystems/web-client.zh.md) — 浏览器与 Host 的职责。
- [插槽](../../../docs/subsystems/slots.zh.md) — 侧栏扩展。
- [DeepSeek API key 供应商](../../llm/llm-deepseek-api-key/README.zh.md) — 凭据配置。

-----

<a id="model-experience"></a>
## 模型体验

无，因为此包只呈现浏览器 UI，不注册面向模型的内容。

#### KV 缓存影响

无；余额查询不会组装或发送模型请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

余额显示有以下限制：

- 只支持官方 API key 路由及人民币余额；账号授权、其他供应商及只有美元余额的情况显示不支持获取。
- 条目不会轮询或扣减会话费用。凭据变化后需手动刷新或重新打开页面。
- 真实官方服务验证需要已启用的 DeepSeek API key；包测试使用外部 HTTP 服务的可控响应。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
