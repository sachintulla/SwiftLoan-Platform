/**
 * Audit trail and response helper for CSV exports.
 *
 * `auditAdmin` skips GET requests, and every export is a GET, so before this an
 * export of the customer list left no record of who took it. Each export route
 * calls `auditExport` once, after it knows how many rows it is returning.
 */
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export interface ExportAuditInfo {
  /** Short export name; the audit action becomes `export.<name>`. */
  name: string;
  /** The filters the file followed. Safe to store: no secrets live in a list filter. */
  filters: Record<string, unknown>;
  /** Rows written to the file. */
  rows: number;
  /** True when more rows matched than the export cap allows. */
  truncated: boolean;
}

/**
 * Record one export in the admin audit log. Never throws: auditing must not fail
 * the request it records (the same rule as `writeAuditLog`).
 */
export async function auditExport(req: Request, info: ExportAuditInfo): Promise<void> {
  try {
    const path = req.originalUrl.split('?')[0];
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin?.sub ?? null,
        adminEmail: req.admin?.email ?? null,
        action: `export.${info.name}`,
        entity: 'export',
        method: 'GET',
        path,
        status: 200,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
        metadata: { filters: info.filters, rows: info.rows, truncated: info.truncated } as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Intentionally swallowed.
  }
}

/** Send a CSV as a download. A byte-order mark is added so Excel reads UTF-8 names correctly. */
const UTF8_BOM = String.fromCharCode(0xfeff);

export function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(UTF8_BOM + csv);
}

/** `<kind>-YYYY-MM-DD.csv` */
export function csvFilename(kind: string, now = new Date()): string {
  return `${kind}-${now.toISOString().slice(0, 10)}.csv`;
}
