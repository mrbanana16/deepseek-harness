---
description: "DeepSeek API-key balance above Settings, with manual refresh and low-balance colors."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-api-balance

English | [中文](README.zh.md)

## Summary

Users can read their DeepSeek API-key balance above Settings and refresh it with an icon button. The row queries once when the page first resolves the official DeepSeek route. It displays a green amount, orange below ¥1, and red below ¥0.10, or a localized loading, failure, or unsupported-provider status.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Web application composition enables the balance row by default. Custom compositions mount this plugin alongside the sidebar, locale, renderer, Session Remote, settings, credentials, and LLM services:

```yaml
- id: ui-api-balance
  name: '@deepseek-ai/dsh-client-ui-api-balance'
  config:
    timeoutMs: 10000
```

The amount includes both granted and topped-up credit. The Host resolves the active `deepseek-official` provider's settings namespace and its `apiKeyEnv` credential reference for each query. It calls the [official balance API](https://api-docs.deepseek.com/api/get-user-balance/) with Bearer authentication; the browser receives only an amount or status. A custom endpoint on another origin is unsupported.

The row follows the active conversation's selected provider, falling back to the configured default when no conversation is selected. Switching away shows the unsupported status; switching back restores the page's cached result. Manual refresh queries again, including after a failure or credential change. The outlined SVG money icon follows the shared icon stroke and theme color in light and dark modes. Collapsing the sidebar keeps a money icon that refreshes on click and exposes the balance through its tooltip and accessible name.

| Field | Default | Meaning |
|---|---|---|
| `timeoutMs` | `10000` | Maximum duration of the official HTTP request and response read. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host service owns credential resolution, official-origin checks, JSON validation, and request cancellation. The browser model retains one page-local result and shares outstanding refreshes. The browser consumer declares its `remote.apiBalance` dependency after mounting the generated Remote contribution. The plugin binds its observable result to a framework hook and contributes a row through `sidebar.footer.action`; the sidebar owns placement above Settings. Plugin disposal removes the contribution, cancels outstanding requests, and waits for them to settle. The provider-selection projection and configuration notifications update display policy without polling the balance.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web Client architecture](../../../docs/subsystems/web-client.md) — browser and Host ownership.
- [Slots](../../../docs/subsystems/slots.md) — sidebar contributions.
- [DeepSeek API-key provider](../../llm/llm-deepseek-api-key/README.md) — credential configuration.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package only presents browser UI and registers nothing model-facing.

#### KV Cache effect

None; balance queries do not assemble or send model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The balance display has these limits:

- Only the official API-key route and a CNY balance are supported; account grants, other providers, and USD-only balances display the unsupported status.
- The row does not poll or subtract conversation costs. A credential change requires manual refresh or reopening the page.
- Live official-service verification requires an enabled DeepSeek API key; package tests use controlled responses from the external HTTP service.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
