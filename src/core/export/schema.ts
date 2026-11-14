/**
 * A JSON Schema (draft 2020-12) describing a document's shape, inferred from the document itself. The schemas under
 * `data/schema/` are written by the export and committed, so a change to a table's shape shows up as a reviewed change
 * to its schema, and an importer can validate what it reads.
 */
type Schema = Record<string, unknown>;

function merge(a: Schema | undefined, b: Schema): Schema {
  if (!a) return b;
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  const types = (s: Schema): string[] => (Array.isArray(s.type) ? (s.type as string[]) : s.type ? [s.type as string] : []);
  const kinds = [...new Set([...types(a), ...types(b)])];
  // An integer among numbers is a number.
  const type = kinds.includes('number') ? kinds.filter((kind) => kind !== 'integer') : kinds;
  const out: Schema = { type: type.length === 1 ? type[0] : type.sort() };
  if (a.properties || b.properties) {
    const pa = (a.properties ?? {}) as Record<string, Schema>, pb = (b.properties ?? {}) as Record<string, Schema>;
    const properties: Record<string, Schema> = {};
    for (const key of new Set([...Object.keys(pa), ...Object.keys(pb)])) properties[key] = pa[key] && pb[key] ? merge(pa[key], pb[key]!) : (pa[key] ?? pb[key])!;
    out.properties = properties;
    const ra = a.properties ? ((a.required ?? []) as string[]) : null, rb = b.properties ? ((b.required ?? []) as string[]) : null;
    const required = ra && rb ? ra.filter((key) => rb.includes(key)) : (ra ?? rb ?? []);
    if (required.length) out.required = required;
    out.additionalProperties = false;
  }
  else if (typeof a.additionalProperties === 'object' || typeof b.additionalProperties === 'object') {
    const ma = a.additionalProperties as Schema | undefined, mb = b.additionalProperties as Schema | undefined;
    out.additionalProperties = ma && mb && typeof ma === 'object' && typeof mb === 'object' ? merge(ma, mb) : (ma ?? mb);
  }
  if (a.items || b.items) out.items = a.items && b.items ? merge(a.items as Schema, b.items as Schema) : (a.items ?? b.items);
  return out;
}

/**
 * Whether an object is a table keyed by id rather than a record with named fields: three or more entries that are all
 * objects sharing a field, or thirty or more strings. A table's schema describes its rows, not its keys.
 */
function isMap(entries: [string, unknown][]): boolean {
  if (entries.length >= 30 && entries.every(([, item]) => typeof item === 'string')) return true;
  if (entries.length < 3 || !entries.every(([, item]) => item !== null && typeof item === 'object' && !Array.isArray(item))) return false;
  const [first, ...rest] = entries.map(([, item]) => Object.keys(item as object));
  return first!.some((key) => rest.every((keys) => keys.includes(key)));
}

export function inferSchema(value: unknown): Schema {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    let items: Schema | undefined;
    for (const item of value) items = merge(items, inferSchema(item));
    return items ? { type: 'array', items } : { type: 'array' };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (isMap(entries)) {
      let values: Schema | undefined;
      for (const [, item] of entries) values = merge(values, inferSchema(item));
      return { type: 'object', additionalProperties: values! };
    }
    const properties: Record<string, Schema> = {};
    for (const [key, item] of entries) properties[key] = inferSchema(item);
    return { type: 'object', properties, required: entries.map(([key]) => key), additionalProperties: false };
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: typeof value };
}

/** The schema document for one data file. */
export function documentSchema(path: string, about: string, data: unknown): Schema {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://ael-dev3.github.io/Tervain/data/schema/${path.replace(/\.json$/, '.schema.json')}`, title: path, description: about, ...inferSchema(data) };
}
