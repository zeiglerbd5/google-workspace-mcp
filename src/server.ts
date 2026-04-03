import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OAuth2Client } from "google-auth-library";
import type { Permissions } from "./config/permissions.js";
import { registerGmailTools } from "./services/gmail.js";
import { registerCalendarTools } from "./services/calendar.js";
import { registerDocsTools } from "./services/docs.js";
import { registerSheetsTools } from "./services/sheets.js";

export function createServer(auth: OAuth2Client, permissions: Permissions): McpServer {
  const server = new McpServer({
    name: "google-workspace-mcp",
    version: "1.0.0",
  });

  registerGmailTools(server, auth, permissions.gmail);
  registerCalendarTools(server, auth, permissions.calendar);
  registerDocsTools(server, auth, permissions.docs);
  registerSheetsTools(server, auth, permissions.sheets);

  return server;
}
