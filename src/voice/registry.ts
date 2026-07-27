// Ported from @ello/agent-sdk's tools/registry.ts — pure TS, no DOM dependency.
// Same validation/wire-conversion behavior as the original ToolRegistry.
import type { ClientToolOptions, JSONSchema, WireToolDef } from './types';

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
const MAX_TIMEOUT_MS = 30_000;

export class ToolRegistry {
  private tools = new Map<string, ClientToolOptions>();

  register(def: ClientToolOptions): void {
    if (!NAME_RE.test(def.name)) throw new Error(`invalid tool name: "${def.name}"`);
    if (!def.description) throw new Error(`tool "${def.name}" needs a description`);
    if (typeof def.handler !== 'function') throw new Error(`tool "${def.name}" needs a handler`);
    this.tools.set(def.name, def);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ClientToolOptions | undefined {
    return this.tools.get(name);
  }

  // Re-evaluates availableWhen() every call, so page-based gating is always live.
  toWire(): WireToolDef[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.schema,
      sensitive: t.sensitive,
      requires_confirmation: t.requiresConfirmation,
      timeout_ms: t.timeoutMs ? Math.min(t.timeoutMs, MAX_TIMEOUT_MS) : undefined,
      available: t.availableWhen ? t.availableWhen() : true,
    }));
  }

  // Required-key + primitive-type checks only — matches the original SDK's
  // deliberately minimal validation (no enum/nested-schema checks).
  validateArgs(tool: ClientToolOptions, args: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
    const schema = tool.schema;
    if (!schema || schema.type !== 'object') return { ok: true };

    for (const key of schema.required ?? []) {
      if (!(key in args)) return { ok: false, error: `missing required arg "${key}"` };
    }
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      if (!(key in args)) continue;
      const value = args[key];
      const type = (propSchema as JSONSchema).type;
      if (!type) continue;
      const ok =
        (type === 'string' && typeof value === 'string') ||
        (type === 'number' && typeof value === 'number') ||
        (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
        (type === 'boolean' && typeof value === 'boolean') ||
        (type === 'array' && Array.isArray(value)) ||
        (type === 'object' && typeof value === 'object' && value !== null);
      if (!ok) return { ok: false, error: `arg "${key}" must be of type ${type}` };
    }
    return { ok: true };
  }
}
