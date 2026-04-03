import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { hasPermission, type PermissionLevel } from "../config/permissions.js";
import { flattenDocContent, truncate } from "../util/format.js";

export function registerDocsTools(server: McpServer, auth: OAuth2Client, level: PermissionLevel) {
  if (level === "off") return;

  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  if (hasPermission(level, "read")) {
    server.tool(
      "docs_list",
      "List recent Google Docs",
      {
        maxResults: z.number().min(1).max(50).default(10).describe("Max results"),
        query: z.string().optional().describe("Search query for document names"),
      },
      async ({ maxResults, query }) => {
        let q = "mimeType='application/vnd.google-apps.document' and trashed=false";
        if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;

        const res = await drive.files.list({
          q,
          pageSize: maxResults,
          fields: "files(id,name,modifiedTime,owners)",
          orderBy: "modifiedTime desc",
        });

        const files = res.data.files || [];
        if (files.length === 0) {
          return { content: [{ type: "text", text: "No documents found." }] };
        }

        const text = files
          .map((f) => `- **${f.name}** (ID: ${f.id})\n  Modified: ${f.modifiedTime}`)
          .join("\n");

        return { content: [{ type: "text", text }] };
      }
    );

    server.tool(
      "docs_read",
      "Read the contents of a Google Doc",
      {
        documentId: z.string().describe("Document ID (from docs_list or URL)"),
      },
      async ({ documentId }) => {
        const res = await docs.documents.get({ documentId });
        const title = res.data.title || "(untitled)";
        const body = flattenDocContent(res.data.body);

        return {
          content: [{
            type: "text",
            text: `# ${title}\n\n${truncate(body)}`,
          }],
        };
      }
    );
  }

  if (hasPermission(level, "read+write")) {
    server.tool(
      "docs_create",
      "Create a new Google Doc",
      {
        title: z.string().describe("Document title"),
        content: z.string().optional().describe("Initial text content"),
      },
      async ({ title, content }) => {
        const res = await docs.documents.create({
          requestBody: { title },
        });

        const docId = res.data.documentId!;

        if (content) {
          await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
              requests: [{
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              }],
            },
          });
        }

        return {
          content: [{
            type: "text",
            text: `Document created.\nTitle: ${title}\nID: ${docId}\nURL: https://docs.google.com/document/d/${docId}/edit`,
          }],
        };
      }
    );

    server.tool(
      "docs_append",
      "Append text to the end of a Google Doc",
      {
        documentId: z.string().describe("Document ID"),
        text: z.string().describe("Text to append"),
      },
      async ({ documentId, text }) => {
        // Get current doc length to find end index
        const doc = await docs.documents.get({ documentId });
        const endIndex = doc.data.body?.content?.slice(-1)[0]?.endIndex || 1;

        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              insertText: {
                location: { index: Math.max(1, endIndex - 1) },
                text: "\n" + text,
              },
            }],
          },
        });

        return {
          content: [{
            type: "text",
            text: `Text appended to document ${documentId}.`,
          }],
        };
      }
    );
  }

  if (hasPermission(level, "full")) {
    server.tool(
      "docs_update",
      "Send batch update requests to a Google Doc (advanced)",
      {
        documentId: z.string().describe("Document ID"),
        requests: z.string().describe("JSON array of Google Docs API batch update requests"),
      },
      async ({ documentId, requests }) => {
        const parsed = JSON.parse(requests);
        await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: parsed },
        });

        return {
          content: [{
            type: "text",
            text: `Batch update applied to document ${documentId}. ${parsed.length} request(s) processed.`,
          }],
        };
      }
    );
  }
}
