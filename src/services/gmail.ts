import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { hasPermission, type PermissionLevel } from "../config/permissions.js";
import { htmlToText, truncate } from "../util/format.js";

function getBody(payload: any): string {
  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  // Multipart — find text/plain first, fall back to text/html
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, "base64url").toString("utf-8");
    }
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html?.body?.data) {
      return htmlToText(Buffer.from(html.body.data, "base64url").toString("utf-8"));
    }
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = getBody(part);
        if (nested) return nested;
      }
    }
  }
  return "(no readable body)";
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

// Reject CR/LF in header values to prevent SMTP header injection
// (e.g. an attacker-controlled subject smuggling extra "Bcc:" lines).
function assertNoCRLF(field: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field}: line breaks are not allowed in email headers`);
  }
}

export function registerGmailTools(server: McpServer, auth: OAuth2Client, level: PermissionLevel) {
  if (level === "off") return;

  const gmail = google.gmail({ version: "v1", auth });

  if (hasPermission(level, "read")) {
    server.tool(
      "gmail_search",
      "Search Gmail messages. Uses Gmail search syntax (from:, to:, subject:, has:attachment, etc.)",
      {
        query: z.string().describe("Gmail search query"),
        maxResults: z.number().min(1).max(50).default(10).describe("Max results to return"),
      },
      async ({ query, maxResults }) => {
        const res = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults,
        });

        const messages = res.data.messages || [];
        if (messages.length === 0) {
          return { content: [{ type: "text", text: "No messages found." }] };
        }

        const summaries = await Promise.all(
          messages.map(async (msg) => {
            const detail = await gmail.users.messages.get({
              userId: "me",
              id: msg.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date"],
            });
            const h = detail.data.payload?.headers || [];
            return `**${getHeader(h, "Subject") || "(no subject)"}**\nFrom: ${getHeader(h, "From")}\nDate: ${getHeader(h, "Date")}\nID: ${msg.id}`;
          })
        );

        return { content: [{ type: "text", text: summaries.join("\n\n---\n\n") }] };
      }
    );

    server.tool(
      "gmail_read",
      "Read a full email message by ID. Returns headers and body text.",
      {
        messageId: z.string().describe("Message ID (from gmail_search results)"),
      },
      async ({ messageId }) => {
        const res = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        const headers = res.data.payload?.headers || [];
        const body = getBody(res.data.payload);

        const text = [
          `From: ${getHeader(headers, "From")}`,
          `To: ${getHeader(headers, "To")}`,
          `Subject: ${getHeader(headers, "Subject")}`,
          `Date: ${getHeader(headers, "Date")}`,
          "",
          truncate(body),
        ].join("\n");

        return { content: [{ type: "text", text }] };
      }
    );

    server.tool(
      "gmail_list_labels",
      "List all Gmail labels (Inbox, Sent, custom labels, etc.)",
      {},
      async () => {
        const res = await gmail.users.labels.list({ userId: "me" });
        const labels = res.data.labels || [];
        const text = labels.map((l) => `- ${l.name} (${l.id})`).join("\n");
        return { content: [{ type: "text", text: text || "No labels found." }] };
      }
    );

    server.tool(
      "gmail_get_attachment",
      "Download an attachment from an email. Returns text content directly for text files, or saves binary files to the workspace and returns the path.",
      {
        messageId: z.string().describe("Message ID (from gmail_search results)"),
        filename: z.string().optional().describe("Filename to download. If omitted, lists all attachments on the message."),
      },
      async ({ messageId, filename }) => {
        const res = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        // Find all attachments
        const attachments: { filename: string; mimeType: string; attachmentId: string; size: number }[] = [];
        function findAttachments(parts: any[]) {
          for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
              attachments.push({
                filename: part.filename,
                mimeType: part.mimeType || "application/octet-stream",
                attachmentId: part.body.attachmentId,
                size: part.body.size || 0,
              });
            }
            if (part.parts) findAttachments(part.parts);
          }
        }
        if (res.data.payload?.parts) findAttachments(res.data.payload.parts);

        if (attachments.length === 0) {
          return { content: [{ type: "text", text: "No attachments on this message." }] };
        }

        // If no filename specified, list them
        if (!filename) {
          const list = attachments
            .map((a, i) => `${i + 1}. **${a.filename}** (${a.mimeType}, ${Math.round(a.size / 1024)}KB)`)
            .join("\n");
          return { content: [{ type: "text", text: `Attachments:\n${list}\n\nCall again with a filename to download.` }] };
        }

        // Find the matching attachment
        const match = attachments.find((a) => a.filename.toLowerCase() === filename.toLowerCase());
        if (!match) {
          const names = attachments.map((a) => a.filename).join(", ");
          return { content: [{ type: "text", text: `Attachment "${filename}" not found. Available: ${names}` }] };
        }

        // Download it
        const attachment = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: match.attachmentId,
        });

        const data = Buffer.from(attachment.data.data!, "base64url");

        // Text files: return content directly
        const textTypes = ["text/", "application/json", "application/xml", "application/csv"];
        if (textTypes.some((t) => match.mimeType.startsWith(t))) {
          return { content: [{ type: "text", text: `**${match.filename}**\n\n${truncate(data.toString("utf-8"))}` }] };
        }

        // Binary files: save to workspace
        const downloadDir = join(process.env.GWORKSPACE_DOWNLOAD_DIR || "/tmp", "gmail-attachments");
        mkdirSync(downloadDir, { recursive: true });
        const savePath = join(downloadDir, match.filename);
        writeFileSync(savePath, data);

        return { content: [{ type: "text", text: `Saved **${match.filename}** (${Math.round(data.length / 1024)}KB) to ${savePath}` }] };
      }
    );
  }

  if (hasPermission(level, "read+draft")) {
    server.tool(
      "gmail_create_draft",
      "Create a draft email (saved, not sent)",
      {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        cc: z.string().optional().describe("CC recipients (comma-separated)"),
      },
      async ({ to, subject, body, cc }) => {
        assertNoCRLF("to", to);
        assertNoCRLF("subject", subject);
        if (cc) assertNoCRLF("cc", cc);

        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          ...(cc ? [`Cc: ${cc}`] : []),
          "Content-Type: text/plain; charset=utf-8",
          "",
          body,
        ].join("\n");

        const encodedMessage = Buffer.from(headers).toString("base64url");

        const res = await gmail.users.drafts.create({
          userId: "me",
          requestBody: {
            message: { raw: encodedMessage },
          },
        });

        return {
          content: [{
            type: "text",
            text: `Draft created.\nDraft ID: ${res.data.id}\nTo: ${to}\nSubject: ${subject}`,
          }],
        };
      }
    );
  }

  if (hasPermission(level, "full")) {
    server.tool(
      "gmail_send",
      "Send an email directly",
      {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        cc: z.string().optional().describe("CC recipients (comma-separated)"),
      },
      async ({ to, subject, body, cc }) => {
        assertNoCRLF("to", to);
        assertNoCRLF("subject", subject);
        if (cc) assertNoCRLF("cc", cc);

        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          ...(cc ? [`Cc: ${cc}`] : []),
          "Content-Type: text/plain; charset=utf-8",
          "",
          body,
        ].join("\n");

        const encodedMessage = Buffer.from(headers).toString("base64url");

        const res = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encodedMessage },
        });

        return {
          content: [{
            type: "text",
            text: `Email sent.\nMessage ID: ${res.data.id}\nTo: ${to}\nSubject: ${subject}`,
          }],
        };
      }
    );
  }
}
