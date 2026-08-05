export interface OfflineOperation {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  createdAt: string;
  attempts: number;
}

const DB_NAME = "lfb-pedidopro";
const STORE = "operations";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineOperation(input: Omit<OfflineOperation, "id" | "createdAt" | "attempts">): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const op: OfflineOperation = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new CustomEvent("pedidopro:offline-queued", { detail: op }));
}

async function listOperations(db: IDBDatabase): Promise<OfflineOperation[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as OfflineOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

async function deleteOperation(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateOperation(db: IDBDatabase, op: OfflineOperation): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOfflineOperations(): Promise<{ processed: number; remaining: number }> {
  const db = await openDb();
  if (!db || typeof navigator === "undefined" || !navigator.onLine) return { processed: 0, remaining: 0 };
  const operations = await listOperations(db);
  let processed = 0;
  for (const operation of operations) {
    try {
      const response = await fetch(operation.url, {
        method: operation.method,
        headers: { ...operation.headers, "X-Offline-Operation-Id": operation.id },
        body: operation.body
      });
      if (response.ok || response.status === 409) {
        await deleteOperation(db, operation.id);
        processed += 1;
      } else if (response.status >= 400 && response.status < 500) {
        // A validation/authorization error cannot be solved by retrying indefinitely.
        await deleteOperation(db, operation.id);
        window.dispatchEvent(new CustomEvent("pedidopro:offline-rejected", { detail: { operation, status: response.status } }));
      } else {
        await updateOperation(db, { ...operation, attempts: operation.attempts + 1 });
        break;
      }
    } catch {
      await updateOperation(db, { ...operation, attempts: operation.attempts + 1 });
      break;
    }
  }
  const remaining = (await listOperations(db)).length;
  window.dispatchEvent(new CustomEvent("pedidopro:offline-flushed", { detail: { processed, remaining } }));
  return { processed, remaining };
}
