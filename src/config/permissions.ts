import { readFileSync } from "node:fs";
import { z } from "zod";

const PermissionLevel = z.enum(["off", "read", "read+draft", "read+write", "full"]);
export type PermissionLevel = z.infer<typeof PermissionLevel>;

const PermissionsSchema = z.object({
  gmail: PermissionLevel.default("off"),
  calendar: PermissionLevel.default("off"),
  docs: PermissionLevel.default("off"),
  sheets: PermissionLevel.default("off"),
});

export type Permissions = z.infer<typeof PermissionsSchema>;

const LEVEL_HIERARCHY: Record<PermissionLevel, number> = {
  off: 0,
  read: 1,
  "read+draft": 2,
  "read+write": 3,
  full: 4,
};

export function hasPermission(current: PermissionLevel, required: PermissionLevel): boolean {
  return LEVEL_HIERARCHY[current] >= LEVEL_HIERARCHY[required];
}

export function loadPermissions(path: string): Permissions {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return PermissionsSchema.parse(raw);
}

/** Compute minimal Google OAuth scopes from permissions config */
export function computeScopes(permissions: Permissions): string[] {
  const scopes: string[] = [];

  if (permissions.gmail !== "off") {
    scopes.push("https://www.googleapis.com/auth/gmail.readonly");
    if (hasPermission(permissions.gmail, "read+draft")) {
      scopes.push("https://www.googleapis.com/auth/gmail.compose");
    }
    if (hasPermission(permissions.gmail, "full")) {
      scopes.push("https://www.googleapis.com/auth/gmail.send");
    }
  }

  if (permissions.calendar !== "off") {
    scopes.push("https://www.googleapis.com/auth/calendar.readonly");
    if (hasPermission(permissions.calendar, "read+write")) {
      scopes.push("https://www.googleapis.com/auth/calendar.events");
    }
  }

  if (permissions.docs !== "off") {
    scopes.push("https://www.googleapis.com/auth/documents.readonly");
    if (hasPermission(permissions.docs, "read+write")) {
      scopes.push("https://www.googleapis.com/auth/documents");
    }
  }

  if (permissions.sheets !== "off") {
    scopes.push("https://www.googleapis.com/auth/spreadsheets.readonly");
    if (hasPermission(permissions.sheets, "read+write")) {
      scopes.push("https://www.googleapis.com/auth/spreadsheets");
    }
  }

  // Drive API needed for listing docs/sheets
  if (permissions.docs !== "off" || permissions.sheets !== "off") {
    scopes.push("https://www.googleapis.com/auth/drive.readonly");
  }

  return scopes;
}
