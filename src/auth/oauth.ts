import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

interface ClientSecret {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export function loadClientSecret(path: string): ClientSecret {
  if (!existsSync(path)) {
    throw new Error(
      `OAuth client secret not found at '${path}'.\n\n` +
      `To set up:\n` +
      `  1. Create OAuth 2.0 credentials (Desktop app) at https://console.cloud.google.com/\n` +
      `  2. Download the JSON and save it as 'client_secret.json' in the project root\n` +
      `     (or set GOOGLE_CLIENT_SECRET_PATH to point at it).\n` +
      `  3. Run 'npm run auth' to authenticate.\n\n` +
      `See README.md for the full setup walkthrough.`
    );
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function createOAuth2Client(clientSecret: ClientSecret): OAuth2Client {
  const { client_id, client_secret, redirect_uris } = clientSecret.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

export function loadTokens(path: string): StoredTokens | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function saveTokens(path: string, tokens: StoredTokens): void {
  writeFileSync(path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function getAuthenticatedClient(
  clientSecretPath: string,
  tokensPath: string
): OAuth2Client {
  const secret = loadClientSecret(clientSecretPath);
  const client = createOAuth2Client(secret);
  const tokens = loadTokens(tokensPath);

  if (!tokens) {
    throw new Error(
      `No tokens found at ${tokensPath}. Run 'npm run auth' to authenticate.`
    );
  }

  client.setCredentials(tokens);

  // Auto-save refreshed tokens
  client.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    saveTokens(tokensPath, merged as StoredTokens);
  });

  return client;
}
