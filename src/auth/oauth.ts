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
