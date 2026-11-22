import { t } from "elysia";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** `?cursor=…&limit=…` for lists whose cursor is a row id. */
export const IdCursorQuery = t.Object({
  cursor: t.Optional(t.String({ format: "uuid" })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE })),
});

/**
 * Asks the repository for one row more than the page size: if it comes
 * back, there is a next page, and the last row of this page is the cursor.
 */
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  toItem: (row: Row) => Item,
  toCursor: (row: Row) => string,
): { items: Item[]; nextCursor: string | null } {
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows.at(-1);
  const hasMore = rows.length > limit;
  return {
    items: pageRows.map(toItem),
    nextCursor: hasMore && lastRow !== undefined ? toCursor(lastRow) : null,
  };
}
