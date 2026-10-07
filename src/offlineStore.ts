// A copy of the shop kept on this device, so the app can open and take sales
// without internet and send the changes when it is back.
//
// One entry per signed-in user, in IndexedDB. Everything here is best effort:
// if the browser refuses storage (private windows do), the app simply works
// online only.

import type { ShopMembership, Subscription } from "./hostingApi";
import type { ShopData, StoredRow } from "./shopSync";

export type OfflineShop = {
  /** The server revision `rows` corresponds to. */
  rev: number;
  /** What the server held at `rev`. */
  rows: StoredRow[];
  /** The shop as it is on this device, including changes not sent yet. */
  data: ShopData;
  shopName: string;
  membership: ShopMembership;
  subscription: Subscription;
  admin: boolean;
};

const DATABASE = "hishabpos";
const STORE = "shops";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function readOfflineShop(userId: string): Promise<OfflineShop | null> {
  try {
    return (await run("readonly", (store) => store.get(userId))) ?? null;
  } catch {
    return null;
  }
}

/** Resolves to false when the copy could not be written. */
export async function writeOfflineShop(userId: string, shop: OfflineShop): Promise<boolean> {
  try {
    await run("readwrite", (store) => store.put(shop, userId));
    return true;
  } catch (error) {
    console.warn("Could not keep an offline copy of the shop", error);
    return false;
  }
}

export async function clearOfflineShop(userId: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(userId));
  } catch {
    // Nothing was stored, or storage is unavailable; either way there is nothing to clear.
  }
}
