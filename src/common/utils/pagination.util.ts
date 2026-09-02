import type { OffsetPageRequest } from '../schemas/pagination.schema.js';

interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean };
}

interface OffsetPage<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; hasMore: boolean };
}

export function buildCursorPage<T>(
  rowsPlusOne: T[],
  limit: number,
  cursorOf: (row: T) => string,
): CursorPage<T> {
  const hasMore = rowsPlusOne.length > limit;
  const data = hasMore ? rowsPlusOne.slice(0, limit) : rowsPlusOne;
  const last = data.at(-1);

  return {
    data,
    meta: {
      nextCursor: hasMore && last ? cursorOf(last) : null,
      hasMore,
    },
  };
}

export function buildOffsetPage<T>(
  data: T[],
  query: OffsetPageRequest,
  total: number,
): OffsetPage<T> {
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
    },
  };
}
