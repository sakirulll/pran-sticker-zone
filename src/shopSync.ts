// Keeps the in-memory shop data and the server in step, one record at a time.
//
// The app works on a single object (categories, products, sales, settings...).
// Each list of records is stored on the server as separate rows, so a save only
// sends what changed and several devices can work at once. The server rules
// that mirror merge3() and COUNTER_FIELDS live in api/shop.php.

export type ShopData = Record<string, any>;
/** [collection, record id, position in its list, value (null when deleted)] */
export type RecordRow = [collection: string, id: string, pos: number, data: unknown];
/** A row as kept on the device: the value stays as JSON text so storing it is cheap. */
export type StoredRow = [collection: string, id: string, pos: number, json: string];
export type Change = { c: string; id: string; pos: number; data?: string; prev?: string | null; del?: boolean };

const META = "_meta";
const COLLECTION_LIST = "_collections";
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const RECORD_ID = /^[A-Za-z0-9_.:-]{1,40}$/;
const COUNTER_FIELDS = new Set(["stock"]);

type Entry = { json: string; pos: number };

const isObject = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A list of records: every entry is an object carrying its own id. */
export function isRecordList(value: unknown): value is Record<string, any>[] {
  return Array.isArray(value)
    && value.every((entry) => isObject(entry) && (typeof entry.id === "number" || typeof entry.id === "string"));
}

/**
 * Combines a local change with a newer version from another device. `base` is
 * what the local change started from, `mine` the local value, `theirs` the newer one.
 */
export function merge3(base: unknown, mine: unknown, theirs: unknown): unknown {
  if (isObject(mine) && isObject(theirs)) {
    const start = isObject(base) ? base : {};
    const result: Record<string, any> = { ...theirs };
    for (const [key, value] of Object.entries(mine)) {
      const known = key in start;
      if (known && same(start[key], value)) continue;
      const isCounter = COUNTER_FIELDS.has(key) && known && isNumber(start[key]) && isNumber(value) && isNumber(theirs[key]);
      result[key] = isCounter ? theirs[key] + (value - start[key]) : value;
    }
    for (const key of Object.keys(start)) {
      if (!(key in mine)) delete result[key];
    }
    return result;
  }
  if (isNumber(base) && isNumber(mine) && isNumber(theirs)) return theirs + (mine - base);
  return same(base, mine) ? theirs : mine;
}

// Other parts of the app hold on to record objects, so a record is updated
// where it is instead of being swapped for a new object.
function replaceInPlace(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  Object.assign(target, source);
}

/** Turns the rows the server sends on load into the shop object, or null for a brand-new shop. */
export function buildShopData(rows: RecordRow[]): ShopData | null {
  if (!rows.length) return null;
  const data: ShopData = {};
  const lists = new Map<string, { pos: number; value: unknown }[]>();
  for (const [collection, id, pos, value] of rows) {
    if (collection !== META) {
      if (!lists.has(collection)) lists.set(collection, []);
      lists.get(collection)!.push({ pos, value });
    } else if (id === COLLECTION_LIST) {
      for (const name of Array.isArray(value) ? value : []) {
        if (!lists.has(name)) lists.set(name, []);
      }
    } else {
      data[id] = value;
    }
  }
  for (const [collection, entries] of lists) {
    data[collection] = entries.sort((a, b) => a.pos - b.pos).map((entry) => entry.value);
  }
  return data;
}

export class ShopSync {
  /** The server revision this device has caught up to. */
  rev: number;
  private readonly getData: () => ShopData;
  // What the server is known to hold, as [collection -> id -> value and position].
  private readonly synced = new Map<string, Map<string, Entry>>();

  constructor(getData: () => ShopData, rev: number, rows: RecordRow[]) {
    this.getData = getData;
    this.rev = rev;
    for (const [collection, id, pos, value] of rows) this.remember(collection, id, JSON.stringify(value), pos);
  }

  /** Rebuilds the state saved by exportRows(), for starting without the server. */
  static restore(getData: () => ShopData, rev: number, rows: StoredRow[]) {
    const sync = new ShopSync(getData, rev, []);
    for (const [collection, id, pos, json] of rows) sync.remember(collection, id, json, pos);
    return sync;
  }

  /** What the server is known to hold, in a form that can be stored on the device. */
  exportRows(): StoredRow[] {
    const rows: StoredRow[] = [];
    for (const [collection, entries] of this.synced) {
      for (const [id, entry] of entries) rows.push([collection, id, entry.pos, entry.json]);
    }
    return rows;
  }

  private entry(collection: string, id: string) {
    return this.synced.get(collection)?.get(id);
  }

  private remember(collection: string, id: string, json: string, pos: number) {
    if (!this.synced.has(collection)) this.synced.set(collection, new Map());
    this.synced.get(collection)!.set(id, { json, pos });
  }

  private forget(collection: string, id: string) {
    this.synced.get(collection)?.delete(id);
  }

  /** Everything that differs from what the server holds. */
  collectChanges(): Change[] {
    const data = this.getData();
    const changes: Change[] = [];
    const seen = new Set<string>();
    const note = (collection: string, id: string, pos: number, value: unknown) => {
      seen.add(`${collection}\n${id}`);
      const json = JSON.stringify(value);
      const known = this.entry(collection, id);
      if (!known || known.json !== json || known.pos !== pos) {
        changes.push({ c: collection, id, pos, data: json, prev: known?.json ?? null });
      }
    };

    const collections: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!NAME.test(key) || value === undefined || typeof value === "function") continue;
      if (!isRecordList(value)) {
        note(META, key, 0, value);
        continue;
      }
      collections.push(key);
      // Positions only need to rise down the list, so a new record takes a gap
      // next to its neighbours and the others keep the position they have.
      const following: (number | undefined)[] = new Array(value.length);
      let next: number | undefined;
      for (let index = value.length - 1; index >= 0; index--) {
        following[index] = next;
        next = this.entry(key, String(value[index].id))?.pos ?? next;
      }
      let previous: number | undefined;
      const used = new Set<string>();
      for (let index = 0; index < value.length; index++) {
        const id = String(value[index].id);
        if (!RECORD_ID.test(id) || used.has(id)) continue;
        used.add(id);
        let pos = this.entry(key, id)?.pos;
        if (pos === undefined || (previous !== undefined && pos <= previous)) {
          const after = following[index];
          const gap = after !== undefined && (previous === undefined || after > previous) ? after : undefined;
          if (previous === undefined) pos = gap === undefined ? 1 : gap - 1;
          else pos = gap === undefined ? previous + 1 : (previous + gap) / 2;
        }
        previous = pos;
        note(key, id, pos, value[index]);
      }
    }
    note(META, COLLECTION_LIST, 0, collections.sort());

    for (const [collection, entries] of this.synced) {
      for (const id of entries.keys()) {
        if (!seen.has(`${collection}\n${id}`)) changes.push({ c: collection, id, pos: 0, del: true });
      }
    }
    return changes;
  }

  /** Records a successful save and brings in what other devices changed meanwhile. */
  commit(sent: Change[], rev: number, remote: RecordRow[]) {
    for (const change of sent) {
      if (change.del) this.forget(change.c, change.id);
      else this.remember(change.c, change.id, change.data!, change.pos);
    }
    this.rev = rev;
    return this.applyRemote(remote);
  }

  private applyRemote(rows: RecordRow[]): boolean {
    const data = this.getData();
    for (const [collection, id, pos, value] of rows) {
      const known = this.entry(collection, id);
      if (collection === META) this.applyMeta(data, id, value, known);
      else this.applyRecord(data, collection, id, pos, value, known);
      if (value === null) this.forget(collection, id);
      else this.remember(collection, id, JSON.stringify(value), pos);
    }
    return rows.length > 0;
  }

  private applyMeta(data: ShopData, key: string, value: unknown, known: Entry | undefined) {
    if (key === COLLECTION_LIST) {
      for (const name of Array.isArray(value) ? value : []) {
        if (data[name] === undefined) data[name] = [];
      }
      return;
    }
    if (value === null) {
      delete data[key];
      return;
    }
    const local = data[key];
    // An unsent local edit is kept and combined with the incoming version.
    const edited = local !== undefined && (!known || known.json !== JSON.stringify(local));
    const next = edited ? merge3(known ? JSON.parse(known.json) : undefined, local, value) : value;
    if (isObject(local) && isObject(next)) replaceInPlace(local, next);
    else data[key] = next;
  }

  private applyRecord(data: ShopData, collection: string, id: string, pos: number, value: unknown, known: Entry | undefined) {
    if (!Array.isArray(data[collection])) data[collection] = [];
    const list: Record<string, any>[] = data[collection];
    const index = list.findIndex((record) => String(record?.id) === id);
    if (value === null) {
      if (index >= 0) list.splice(index, 1);
      return;
    }
    if (!isObject(value)) return;
    if (index >= 0) {
      const local = list[index];
      const edited = !known || known.json !== JSON.stringify(local);
      const next = edited ? merge3(known ? JSON.parse(known.json) : undefined, local, value) : value;
      replaceInPlace(local, next as Record<string, any>);
      return;
    }
    // New from another device: goes where its position says, among the records already here.
    let at = list.length;
    for (let i = 0; i < list.length; i++) {
      const other = this.entry(collection, String(list[i]?.id))?.pos;
      if (other !== undefined && other > pos) { at = i; break; }
    }
    list.splice(at, 0, value);
  }
}

/** Splits a save into requests the server accepts (at most `maxCount` records and `maxBytes` each). */
export function chunkChanges(changes: Change[], maxCount = 400, maxBytes = 1_500_000): Change[][] {
  const batches: Change[][] = [];
  let batch: Change[] = [];
  let bytes = 0;
  for (const change of changes) {
    const size = (change.data?.length ?? 0) + (change.prev?.length ?? 0) + 80;
    if (batch.length && (batch.length >= maxCount || bytes + size > maxBytes)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(change);
    bytes += size;
  }
  if (batch.length || !batches.length) batches.push(batch);
  return batches;
}
