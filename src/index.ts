import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAuthenticatedClient } from "./auth/oauth.js";
import { loadPermissions, computeScopes } from "./config/permissions.js";
import { createServer } from "./server.js";

const clientSecretPath = process.env.GOOGLE_CLIENT_SECRET_PATH || "./client_secret.json";
const tokensPath = process.env.GWORKSPACE_TOKENS_PATH || "./tokens.json";
const permissionsPath = process.env.GWORKSPACE_PERMISSIONS_PATH || "./permissions.json";

// Load permissions
const permissions = loadPermissions(permissionsPath);
const scopes = computeScopes(permissions);

const enabledServices = Object.entries(permissions)
  .filter(([_, level]) => level !== "off")
  .map(([service, level]) => `${service}:${level}`);

if (enabledServices.length === 0) {
  console.error("No services enabled in permissions config. Nothing to do.");
  process.exit(1);
}

// Authenticate
const auth = getAuthenticatedClient(clientSecretPath, tokensPath);

// Create and start server
const server = createServer(auth, permissions);
const transport = new StdioServerTransport();
await server.connect(transport);
