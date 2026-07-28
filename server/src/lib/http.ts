import type { Response } from 'express';

// Standard envelope for all WS4 (tracking + admin) responses:
//   { success, data, message, pagination?, error? }

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, message = 'OK', pagination?: Pagination) {
  return res.json({ success: true, data, message, ...(pagination ? { pagination } : {}) });
}

export function created<T>(res: Response, data: T, message = 'Created') {
  return res.status(201).json({ success: true, data, message });
}

export function fail(res: Response, status: number, error: string) {
  return res.status(status).json({ success: false, data: null, message: error, error });
}

// Parse ?page=&pageSize= with sane bounds.
export function pageParams(q: Record<string, unknown>, defaultSize = 20) {
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? String(defaultSize)), 10) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate(page: number, pageSize: number, total: number): Pagination {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
