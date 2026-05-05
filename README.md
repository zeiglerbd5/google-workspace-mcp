# Google Workspace MCP Server

An MCP (Model Context Protocol) server that exposes Gmail, Google Calendar, Google Docs, and Google Sheets as tools for AI agents. Built with configurable per-service permissions so you control exactly what your agent can do.

## Features

- **Gmail** — Search, read, draft emails, download attachments
- **Google Calendar** — List, search, create, update, delete events
- **Google Docs** — List, read, create, append to documents
- **Google Sheets** — List, read, write, append, create spreadsheets
- **Configurable permissions** — Control access per service (read, read+write, full)
- **No send by default** — Gmail defaults to `read+draft` (no sending)
- **Minimal scopes** — Only requests the Google OAuth scopes needed for your permission level

## Quick Start

### 1. Install

```bash
git clone https://github.com/zeiglerbd5/google-workspace-mcp.git
cd google-workspace-mcp
npm install
npm run build
```

### 2. Google Cloud Setup

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable these APIs: Gmail, Calendar, Docs, Sheets, Drive
3. Create OAuth 2.0 credentials (Desktop app type)
4. Download the client secret JSON and save as `client_secret.json` in the project root

### 3. Configure Permissions

Edit `permissions.json` to control what the server exposes:

```json
{
  "gmail": "read+draft",
  "calendar": "read+write",
  "docs": "read+write",
  "sheets": "read+write"
}
```

**Permission levels:**

| Level | Description |
|-------|-------------|
| `off` | Service disabled — no tools registered |
| `read` | List, search, get only |
| `read+draft` | Read + create drafts (Gmail only) |
| `read+write` | Read + create/modify |
| `full` | Everything including send, delete |

### 4. Authenticate

```bash
npm run auth
```

Opens a browser for Google OAuth consent. Sign in, grant permissions, and tokens are saved to `tokens.json`.

For headless servers, run `npm run auth` on a machine with a browser, then copy `tokens.json` to the server.

### 5. Run

```bash
node dist/index.js
```

Or with environment variables:

```bash
GOOGLE_CLIENT_SECRET_PATH=./client_secret.json \
GWORKSPACE_TOKENS_PATH=./tokens.json \
GWORKSPACE_PERMISSIONS_PATH=./permissions.json \
node dist/index.js
```

## MCP Client Configuration

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_SECRET_PATH": "/path/to/client_secret.json",
        "GWORKSPACE_TOKENS_PATH": "/path/to/tokens.json",
        "GWORKSPACE_PERMISSIONS_PATH": "/path/to/permissions.json"
      }
    }
  }
}
```

### OpenClaw

```json
{
  "mcp": {
    "servers": {
      "google-workspace": {
        "command": "node",
        "args": ["/path/to/google-workspace-mcp/dist/index.js"],
        "env": {
          "GOOGLE_CLIENT_SECRET_PATH": "/path/to/client_secret.json",
          "GWORKSPACE_TOKENS_PATH": "/path/to/tokens.json",
          "GWORKSPACE_PERMISSIONS_PATH": "/path/to/permissions.json"
        }
      }
    }
  }
}
```

## Tools

### Gmail

| Tool | Permission | Description |
|------|-----------|-------------|
| `gmail_search` | read | Search messages (Gmail search syntax) |
| `gmail_read` | read | Read full message by ID |
| `gmail_list_labels` | read | List all labels |
| `gmail_get_attachment` | read | List/download email attachments |
| `gmail_create_draft` | read+draft | Create a draft email |
| `gmail_send` | full | Send an email |

### Calendar

| Tool | Permission | Description |
|------|-----------|-------------|
| `calendar_list` | read | List upcoming events |
| `calendar_get_event` | read | Get event details |
| `calendar_search` | read | Search events by query |
| `calendar_create_event` | read+write | Create a new event |
| `calendar_update_event` | full | Update an existing event |
| `calendar_delete_event` | full | Delete an event |

### Docs

| Tool | Permission | Description |
|------|-----------|-------------|
| `docs_list` | read | List recent documents |
| `docs_read` | read | Read document content |
| `docs_create` | read+write | Create a new document |
| `docs_append` | read+write | Append text to a document |
| `docs_update` | full | Batch update a document |

### Sheets

| Tool | Permission | Description |
|------|-----------|-------------|
| `sheets_list` | read | List recent spreadsheets |
| `sheets_get` | read | Get spreadsheet metadata |
| `sheets_read_range` | read | Read cell values (A1 notation) |
| `sheets_write_range` | read+write | Write values to a range |
| `sheets_append_rows` | read+write | Append rows to a sheet |
| `sheets_create` | read+write | Create a new spreadsheet |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_SECRET_PATH` | `./client_secret.json` | Path to OAuth client secret |
| `GWORKSPACE_TOKENS_PATH` | `./tokens.json` | Path to stored OAuth tokens |
| `GWORKSPACE_PERMISSIONS_PATH` | `./permissions.json` | Path to permissions config |
| `GWORKSPACE_DOWNLOAD_DIR` | `/tmp` | Directory for downloaded attachments |

## Security

- Tokens are stored with `600` permissions (owner read/write only)
- `tokens.json` and `client_secret.json` are gitignored
- Permission levels prevent tools from being registered at all — not just hidden, but nonexistent from the agent's perspective
- Scopes are computed from permissions — a `read` config never requests write scopes from Google

## License

MIT
