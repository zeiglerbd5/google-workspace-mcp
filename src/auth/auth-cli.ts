#!/usr/bin/env tsx
/**
 * Standalone OAuth consent flow.
 * Run on a machine with a browser: npm run auth
 * Then copy tokens.json to the VM.
 */

import { createServer } from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";
import { loadClientSecret, saveTokens } from "./oauth.js";
import { loadPermissions, computeScopes } from "../config/permissions.js";

const clientSecretPath = process.env.GOOGLE_CLIENT_SECRET_PATH || "./client_secret.json";
const tokensPath = process.env.GWORKSPACE_TOKENS_PATH || "./tokens.json";
const permissionsPath = process.env.GWORKSPACE_PERMISSIONS_PATH || "./permissions.json";

const secret = loadClientSecret(clientSecretPath);
const permissions = loadPermissions(permissionsPath);
const scopes = computeScopes(permissions);

console.log("\nGoogle Workspace MCP — OAuth Setup\n");
console.log("Scopes requested:");
scopes.forEach((s) => console.log(`  - ${s.split("/").pop()}`));
console.log("");

// For installed/desktop apps, Google supports loopback redirects:
// http://127.0.0.1:<port> — the port can be any available port
const PORT = 3000;
const redirectUri = `http://127.0.0.1:${PORT}`;

// Create OAuth2 client with the loopback redirect URI
const { client_id, client_secret } = secret.installed;
const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

const authUrl = client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",
});

// Start local server to catch the callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Auth Error</h1><p>${error}</p>`);
    console.error("Auth error:", error);
    server.close();
    process.exit(1);
    return;
  }

  if (!code) {
    res.writeHead(200);
    res.end("Waiting for auth code...");
    return;
  }

  try {
    const { tokens } = await client.getToken(code);
    saveTokens(tokensPath, tokens as any);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Authenticated!</h1><p>You can close this tab. Tokens saved.</p>");

    console.log(`\nTokens saved to ${tokensPath}`);
    console.log("If running on a headless server, copy this file there, e.g.:");
    console.log(`  scp ${tokensPath} user@your-server:/path/to/google-workspace-mcp/tokens.json\n`);

    server.close();
    process.exit(0);
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Token Exchange Failed</h1><p>${err.message}</p>`);
    console.error("Token exchange failed:", err.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this URL in your browser:\n");
  console.log(authUrl);
  console.log(`\nWaiting for callback on http://127.0.0.1:${PORT} ...\n`);
});
