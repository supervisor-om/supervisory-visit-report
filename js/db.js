// =========================================================================
// IndexedDB Database Layer
// =========================================================================
const DB_NAME = 'SupervisoryDB';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

let dbInstance = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('teacherName', 'teacherName', { unique: false });
                store.createIndex('school', 'school', { unique: false });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('type', 'type', { unique: false });
            }
        };
        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

function saveReport(key, data) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const record = { key, ...data, updatedAt: Date.now() };
        const req = tx.objectStore(STORE_NAME).put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = (e) => reject(e.target.error);
    }));
}

function loadReport(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
    }));
}

function getAllReports() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
    }));
}

function deleteReport(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    }));
}

function exportAllBackup() {
    return getAllReports().then(reports => {
        const backup = {};
        reports.forEach(r => { backup[r.key] = JSON.parse(JSON.stringify(r)); delete backup[r.key].key; });
        return backup;
    });
}

function importBackup(data) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let count = 0;
        Object.entries(data).forEach(([key, value]) => {
            const record = { key, ...value, updatedAt: Date.now() };
            store.put(record);
            count++;
        });
        tx.oncomplete = () => resolve(count);
        tx.onerror = (e) => reject(e.target.error);
    }));
}

// Migration: move localStorage data to IndexedDB
function migrateFromLocalStorage() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let migrated = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('supervisory_report_') || key.startsWith('school_report_'))) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data) {
                        store.put({ key, ...data, updatedAt: Date.now() });
                        migrated++;
                    }
                } catch (e) { /* skip invalid */ }
            }
        }
        tx.oncomplete = () => {
            console.log(`Migrated ${migrated} reports from localStorage to IndexedDB`);
            resolve(migrated);
        };
        tx.onerror = (e) => reject(e.target.error);
    }));
}

// Auto-migrate on load
migrateFromLocalStorage().catch(err => console.warn('Migration failed:', err));