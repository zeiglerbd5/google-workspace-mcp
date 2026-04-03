import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { hasPermission, type PermissionLevel } from "../config/permissions.js";

function formatEvent(event: any): string {
  const start = event.start?.dateTime || event.start?.date || "?";
  const end = event.end?.dateTime || event.end?.date || "?";
  const attendees = event.attendees?.map((a: any) => a.email).join(", ") || "none";
  return [
    `**${event.summary || "(no title)"}**`,
    `When: ${start} → ${end}`,
    `Where: ${event.location || "not set"}`,
    `Attendees: ${attendees}`,
    `Status: ${event.status || "?"}`,
    `ID: ${event.id}`,
    event.description ? `\nDescription: ${event.description}` : "",
  ].filter(Boolean).join("\n");
}

export function registerCalendarTools(server: McpServer, auth: OAuth2Client, level: PermissionLevel) {
  if (level === "off") return;

  const calendar = google.calendar({ version: "v3", auth });

  if (hasPermission(level, "read")) {
    server.tool(
      "calendar_list",
      "List upcoming calendar events",
      {
        maxResults: z.number().min(1).max(50).default(10).describe("Max events to return"),
        calendarId: z.string().default("primary").describe("Calendar ID (default: primary)"),
      },
      async ({ maxResults, calendarId }) => {
        const res = await calendar.events.list({
          calendarId,
          timeMin: new Date().toISOString(),
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
        });

        const events = res.data.items || [];
        if (events.length === 0) {
          return { content: [{ type: "text", text: "No upcoming events." }] };
        }

        const text = events.map(formatEvent).join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

    server.tool(
      "calendar_get_event",
      "Get details of a specific calendar event by ID",
      {
        eventId: z.string().describe("Event ID"),
        calendarId: z.string().default("primary").describe("Calendar ID"),
      },
      async ({ eventId, calendarId }) => {
        const res = await calendar.events.get({ calendarId, eventId });
        return { content: [{ type: "text", text: formatEvent(res.data) }] };
      }
    );

    server.tool(
      "calendar_search",
      "Search calendar events by text query",
      {
        query: z.string().describe("Search query"),
        maxResults: z.number().min(1).max(50).default(10).describe("Max results"),
        calendarId: z.string().default("primary").describe("Calendar ID"),
      },
      async ({ query, maxResults, calendarId }) => {
        const res = await calendar.events.list({
          calendarId,
          q: query,
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
          timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

        const events = res.data.items || [];
        if (events.length === 0) {
          return { content: [{ type: "text", text: "No matching events." }] };
        }

        const text = events.map(formatEvent).join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      }
    );
  }

  if (hasPermission(level, "read+write")) {
    server.tool(
      "calendar_create_event",
      "Create a new calendar event",
      {
        summary: z.string().describe("Event title"),
        startTime: z.string().describe("Start time (ISO 8601, e.g. 2026-04-05T10:00:00-04:00)"),
        endTime: z.string().describe("End time (ISO 8601)"),
        description: z.string().optional().describe("Event description"),
        location: z.string().optional().describe("Event location"),
        attendees: z.string().optional().describe("Comma-separated email addresses"),
        calendarId: z.string().default("primary").describe("Calendar ID"),
      },
      async ({ summary, startTime, endTime, description, location, attendees, calendarId }) => {
        const event: any = {
          summary,
          start: { dateTime: startTime },
          end: { dateTime: endTime },
        };
        if (description) event.description = description;
        if (location) event.location = location;
        if (attendees) {
          event.attendees = attendees.split(",").map((e: string) => ({ email: e.trim() }));
        }

        const res = await calendar.events.insert({
          calendarId,
          requestBody: event,
        });

        return {
          content: [{
            type: "text",
            text: `Event created.\nID: ${res.data.id}\nTitle: ${summary}\nWhen: ${startTime} → ${endTime}`,
          }],
        };
      }
    );
  }

  if (hasPermission(level, "full")) {
    server.tool(
      "calendar_update_event",
      "Update an existing calendar event",
      {
        eventId: z.string().describe("Event ID to update"),
        summary: z.string().optional().describe("New title"),
        startTime: z.string().optional().describe("New start time (ISO 8601)"),
        endTime: z.string().optional().describe("New end time (ISO 8601)"),
        description: z.string().optional().describe("New description"),
        location: z.string().optional().describe("New location"),
        calendarId: z.string().default("primary").describe("Calendar ID"),
      },
      async ({ eventId, summary, startTime, endTime, description, location, calendarId }) => {
        const patch: any = {};
        if (summary) patch.summary = summary;
        if (startTime) patch.start = { dateTime: startTime };
        if (endTime) patch.end = { dateTime: endTime };
        if (description) patch.description = description;
        if (location) patch.location = location;

        const res = await calendar.events.patch({
          calendarId,
          eventId,
          requestBody: patch,
        });

        return {
          content: [{
            type: "text",
            text: `Event updated.\nID: ${res.data.id}\nTitle: ${res.data.summary}`,
          }],
        };
      }
    );

    server.tool(
      "calendar_delete_event",
      "Delete a calendar event",
      {
        eventId: z.string().describe("Event ID to delete"),
        calendarId: z.string().default("primary").describe("Calendar ID"),
      },
      async ({ eventId, calendarId }) => {
        await calendar.events.delete({ calendarId, eventId });
        return { content: [{ type: "text", text: `Event ${eventId} deleted.` }] };
      }
    );
  }
}
