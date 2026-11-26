/**
 * Fill `{name}` slots in a translated sentence: fill('Up to {v}', { v: '₹5,000' }).
 * The strings table holds plain text only, so sentences with a number or a name in them
 * carry a slot, and each language puts the slot where its grammar needs it.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** The same, but as pieces: text stays a string, each slot becomes whatever `slot(name)` returns (e.g. bold text). */
export function fillParts<T>(template: string, slot: (name: string) => T): Array<string | T> {
  return template.split(/(\{\w+\})/g).filter(Boolean).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m ? slot(m[1]) : part;
  });
}
