# n8n-nodes-doclift

An [n8n](https://n8n.io) community node for [Doclift](https://app.doclift.io): generate PDF
documents from templates you design once and fill from your workflows.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Knowing what a template expects](#knowing-what-a-template-expects) · [Compatibility](#compatibility)

## Installation

Follow the
[community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/),
and use `n8n-nodes-doclift` as the package name.

## Credentials

Authentication is an API key, created in Doclift under **External applications**.

| Field | Meaning |
| --- | --- |
| **API Key** | The application's secret key. A **sandbox** key produces watermarked documents; a **production** key produces final ones. The environment is a property of the key, so there is nothing to switch in n8n. |
| **Base URL** | The Doclift instance, `https://app.doclift.io` by default. Synchronous generation is served by this public domain — pointing elsewhere makes it unavailable. |

Use **Test** to check the key: it calls `GET /api/v1/user` and answers `403` on an unknown or
revoked key.

## Operations

### Document → Generate

Generates a PDF from a published template.

- **Template** — picked from a searchable list. Only **workflows** and **fillable forms** are
  offered: they are the categories whose payload the API validates.
- **Mode**
  - **Synchronous** — waits and returns the document in the response. One document per call.
  - **Asynchronous** — queues the generation and answers immediately. A callback URL is required.
- **Variables** — a JSON object keyed by variable name.
- **Options** — a **Tag** of your own (echoed back, and searchable), and a **Callback URL** that
  overrides the one configured on the external application.

The response carries the generated file as a pre-signed URL valid for two hours.

## Knowing what a template expects

`GET /api/v1/templates/:id/payload_contract` describes a template in one shape whatever its
category, and — the part worth reading — says which constraints the API actually enforces:

```json
{
  "category": "fillable_form",
  "variables": [{ "name": "civility", "allowed_values": ["M.", "Mme"], "required": false }],
  "required": [],
  "constrained": ["civility"],
  "enforced": { "required": false, "allowed_values": true, "collections": false }
}
```

The two categories enforce different halves of the same contract:

| | `required` | `allowed_values` | collections |
| --- | --- | --- | --- |
| **Workflow** | refused if missing | refused if outside the list | shape, row count and row fields checked |
| **Fillable form** | not enforced | refused if outside the list | — |

`enforced` tells you which checks you can leave to Doclift and which your workflow should make
itself. A refused payload answers `422` with `invalid_variables`, naming each variable, the value
sent and the values allowed — the same shape for both categories.

Values are compared case-insensitively and trimmed, so `"FR"` matches a list holding `"fr"`.

## Compatibility

Tested against n8n 1.x. Requires Node.js 20 or later.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Doclift](https://app.doclift.io)

## License

[MIT](LICENSE)
