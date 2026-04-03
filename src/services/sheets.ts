import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { hasPermission, type PermissionLevel } from "../config/permissions.js";
import { toMarkdownTable } from "../util/format.js";

export function registerSheetsTools(server: McpServer, auth: OAuth2Client, level: PermissionLevel) {
  if (level === "off") return;

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  if (hasPermission(level, "read")) {
    server.tool(
      "sheets_list",
      "List recent Google Sheets",
      {
        maxResults: z.number().min(1).max(50).default(10).describe("Max results"),
        query: z.string().optional().describe("Search query for spreadsheet names"),
      },
      async ({ maxResults, query }) => {
        let q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
        if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;

        const res = await drive.files.list({
          q,
          pageSize: maxResults,
          fields: "files(id,name,modifiedTime)",
          orderBy: "modifiedTime desc",
        });

        const files = res.data.files || [];
        if (files.length === 0) {
          return { content: [{ type: "text", text: "No spreadsheets found." }] };
        }

        const text = files
          .map((f) => `- **${f.name}** (ID: ${f.id})\n  Modified: ${f.modifiedTime}`)
          .join("\n");

        return { content: [{ type: "text", text }] };
      }
    );

    server.tool(
      "sheets_get",
      "Get spreadsheet metadata (sheet names, row/column counts)",
      {
        spreadsheetId: z.string().describe("Spreadsheet ID"),
      },
      async ({ spreadsheetId }) => {
        const res = await sheets.spreadsheets.get({ spreadsheetId });

        const sheetInfo = res.data.sheets?.map((s) => {
          const props = s.properties;
          return `- ${props?.title} (${props?.gridProperties?.rowCount} rows × ${props?.gridProperties?.columnCount} cols)`;
        }) || [];

        return {
          content: [{
            type: "text",
            text: `**${res.data.properties?.title}**\nID: ${spreadsheetId}\n\nSheets:\n${sheetInfo.join("\n")}`,
          }],
        };
      }
    );

    server.tool(
      "sheets_read_range",
      "Read cell values from a spreadsheet range (A1 notation)",
      {
        spreadsheetId: z.string().describe("Spreadsheet ID"),
        range: z.string().describe("Range in A1 notation (e.g. 'Sheet1!A1:D10')"),
      },
      async ({ spreadsheetId, range }) => {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const rows = res.data.values || [];
        if (rows.length === 0) {
          return { content: [{ type: "text", text: "Range is empty." }] };
        }

        return { content: [{ type: "text", text: toMarkdownTable(rows) }] };
      }
    );
  }

  if (hasPermission(level, "read+write")) {
    server.tool(
      "sheets_write_range",
      "Write values to a spreadsheet range",
      {
        spreadsheetId: z.string().describe("Spreadsheet ID"),
        range: z.string().describe("Range in A1 notation (e.g. 'Sheet1!A1:B2')"),
        values: z.string().describe("JSON 2D array of values, e.g. [[\"a\",\"b\"],[\"c\",\"d\"]]"),
      },
      async ({ spreadsheetId, range, values }) => {
        const parsed = JSON.parse(values);

        const res = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: parsed },
        });

        return {
          content: [{
            type: "text",
            text: `Updated ${res.data.updatedCells} cells in range ${range}.`,
          }],
        };
      }
    );

    server.tool(
      "sheets_append_rows",
      "Append rows to the end of a sheet",
      {
        spreadsheetId: z.string().describe("Spreadsheet ID"),
        range: z.string().describe("Sheet name or range (e.g. 'Sheet1')"),
        values: z.string().describe("JSON 2D array of row values to append"),
      },
      async ({ spreadsheetId, range, values }) => {
        const parsed = JSON.parse(values);

        const res = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: parsed },
        });

        return {
          content: [{
            type: "text",
            text: `Appended ${parsed.length} row(s) to ${range}. Updated range: ${res.data.updates?.updatedRange}`,
          }],
        };
      }
    );

    server.tool(
      "sheets_create",
      "Create a new Google Sheets spreadsheet",
      {
        title: z.string().describe("Spreadsheet title"),
        sheetNames: z.string().optional().describe("Comma-separated sheet names (default: Sheet1)"),
      },
      async ({ title, sheetNames }) => {
        const sheetList = sheetNames
          ? sheetNames.split(",").map((n) => ({ properties: { title: n.trim() } }))
          : undefined;

        const res = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title },
            sheets: sheetList,
          },
        });

        const id = res.data.spreadsheetId!;
        return {
          content: [{
            type: "text",
            text: `Spreadsheet created.\nTitle: ${title}\nID: ${id}\nURL: https://docs.google.com/spreadsheets/d/${id}/edit`,
          }],
        };
      }
    );
  }
}
