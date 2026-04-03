/** Strip HTML tags and decode common entities */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Format a 2D array as a markdown table */
export function toMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "(empty)";

  const header = rows[0];
  const separator = header.map(() => "---");
  const lines = [
    "| " + header.join(" | ") + " |",
    "| " + separator.join(" | ") + " |",
    ...rows.slice(1).map((row) => "| " + row.join(" | ") + " |"),
  ];
  return lines.join("\n");
}

/** Flatten Google Docs body content to plain text */
export function flattenDocContent(body: any): string {
  if (!body?.content) return "(empty document)";

  const parts: string[] = [];
  for (const element of body.content) {
    if (element.paragraph) {
      const text = element.paragraph.elements
        ?.map((el: any) => el.textRun?.content || "")
        .join("") || "";
      parts.push(text);
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        const cells = row.tableCells?.map((cell: any) =>
          cell.content
            ?.map((c: any) =>
              c.paragraph?.elements?.map((el: any) => el.textRun?.content || "").join("") || ""
            )
            .join("")
            .trim()
        ) || [];
        parts.push("| " + cells.join(" | ") + " |");
      }
      parts.push("");
    }
  }
  return parts.join("").trim();
}

/** Truncate text to maxLen chars with indicator */
export function truncate(text: string, maxLen: number = 10000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n\n...(truncated)";
}
