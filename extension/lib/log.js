// Deletion log in IndexedDB: database "rotten", store "log" (auto-increment key), index "time".
// The database is opened on first use, never at load, so jsc tests can import logEntry.

const REASONS = ["duplicate", "rule", "bookmark"];
const STORE = "log";

let dbPromise = null;

export function logEntry(url, reason, time) {
    if (!REASONS.includes(reason)) {
        throw new Error(`unknown reason: ${reason}`);
    }
    return {url, reason, time};
}

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open("rotten", 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(STORE, {autoIncrement: true}).createIndex("time", "time");
            };
            req.onsuccess = () => {
                req.result.onclose = () => {
                    dbPromise = null;
                };
                resolve(req.result);
            };
            req.onerror = () => reject(req.error);
        });
        dbPromise.catch(() => {
            dbPromise = null;
        });
    }
    return dbPromise;
}

function request(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function appendLog(entries) {
    if (entries.length === 0) {
        return;
    }
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const entry of entries) {
            store.add(entry);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

// Newest first. Each entry carries its key as id; pass the last id back as beforeId for the next page.
export async function readLog(limit, beforeId = null) {
    const db = await openDb();
    const range = beforeId === null ? null : IDBKeyRange.upperBound(beforeId, true);
    const req = db.transaction(STORE).objectStore(STORE).openCursor(range, "prev");
    return new Promise((resolve, reject) => {
        const out = [];
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve(out);
                return;
            }
            out.push({id: cursor.primaryKey, ...cursor.value});
            if (out.length >= limit) {
                resolve(out);
                return;
            }
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

// JSON Lines, oldest first.
export async function exportLog() {
    const db = await openDb();
    const all = await request(db.transaction(STORE).objectStore(STORE).getAll());
    return all.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}
