/* =========================================================
 * IndexedDB 持久化层
 *
 * 两个 object store：
 *   world    keyPath 'id'   —— 当前世界，只有一条 id='current'，自动保存用
 *   designs  keyPath 'id'   —— 用户保存下来的图纸列表
 *
 * 降级：IndexedDB 不可用时（file:// 直开、无痕模式、策略禁用），
 * 同一套 API 自动落到 localStorage，功能不瘫——只是容量小、
 * 跨浏览器标签页不共享。降级状态通过 mode() 暴露。
 *
 * 设计原则：
 *   1. 这一层不认识 World 的内部结构，只存不认识业务的对象。
 *      序列化格式由 editor.js 负责，这里只管存取。
 *   2. 所有方法都不抛异常给调用方（除了明确的编程错误），
 *      失败就降级或返回 null —— 存不进去不该让编辑器崩。
 * ========================================================= */
(function (global) {
    'use strict';

    const DB_NAME = 'perler_worlddb';
    const DB_VERSION = 1;
    const STORE_WORLD = 'world';
    const STORE_DESIGNS = 'designs';

    // 降级用的 localStorage key（IndexedDB 挂了才用）
    const LS_WORLD = 'perler.world.fallback';
    const LS_DESIGNS = 'perler.designs.fallback';

    let dbPromise = null;
    let backend = 'idb';        // 'idb' | 'local'
    let degraded = false;       // 是否已经降级过

    /* ---------- IndexedDB 原语 ---------- */

    function reqP(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB 请求失败'));
        });
    }

    function txP(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB 事务失败'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务中止'));
        });
    }

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!global.indexedDB) {
                reject(new Error('这个环境没有 IndexedDB'));
                return;
            }
            let req;
            try {
                req = global.indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                reject(e);
                return;
            }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_WORLD)) {
                    db.createObjectStore(STORE_WORLD, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_DESIGNS)) {
                    const st = db.createObjectStore(STORE_DESIGNS, { keyPath: 'id' });
                    // savedAt 索引：列表按时间倒序排的时候用
                    try { st.createIndex('savedAt', 'savedAt'); } catch (_) { /* 已存在 */ }
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
            req.onblocked = () => reject(new Error('IndexedDB 被别的标签页占着'));
        });
        // 打不开就把缓存的 promise 清掉，下次调用重新试
        dbPromise.catch(() => { dbPromise = null; });
        return dbPromise;
    }

    /* ---------- localStorage 降级实现 ---------- */

    function lsRead(key) {
        try {
            const raw = global.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    function lsWrite(key, val) {
        try {
            global.localStorage.setItem(key, JSON.stringify(val));
            return true;
        } catch (_) { return false; }     // 配额满
    }

    function lsList(key) {
        const v = lsRead(key);
        return Array.isArray(v) ? v : [];
    }

    /* ---------- 统一入口（失败自动降级） ---------- */

    function degrade(reason) {
        if (!degraded) {
            degraded = true;
            backend = 'local';
            if (global.console && console.warn) {
                console.warn('[worldstore] IndexedDB 不可用，降级到 localStorage：', reason && reason.message || reason);
            }
        }
    }

    /**
     * 跑一个 IndexedDB 操作；失败就降级到 localStorage 再试一次。
     * local 也失败 → 返回 fallback(null)，不往上抛。
     */
    async function withDB(idbFn, lsFn) {
        if (backend === 'local') return lsFn();
        try {
            const db = await openDB();
            return await idbFn(db);
        } catch (e) {
            degrade(e);
            try { return lsFn(); } catch (_) { return null; }
        }
    }

    /* ---------- 对外 API ---------- */

    /**
     * 取当前世界。slot 省略就是 'current'。
     */
    async function getWorld(slot) {
        const key = slot || 'current';
        return withDB(
            async (db) => {
                const tx = db.transaction(STORE_WORLD, 'readonly');
                const store = tx.objectStore(STORE_WORLD);
                const rec = await reqP(store.get(key));
                return rec || null;
            },
            () => lsRead(LS_WORLD + ':' + key)
        );
    }

    /**
     * 写当前世界。obj 里必须有 id:'current'（或指定的 slot）。
     */
    async function putWorld(obj, slot) {
        if (!obj) return false;
        const key = slot || 'current';
        const payload = Object.assign({}, obj, { id: key });
        return withDB(
            async (db) => {
                const tx = db.transaction(STORE_WORLD, 'readwrite');
                tx.objectStore(STORE_WORLD).put(payload);
                await txP(tx);
                return true;
            },
            () => lsWrite(LS_WORLD + ':' + key, payload)
        );
    }

    /**
     * 清掉某个槽位（"新建空白"时用）。
     */
    async function clearWorld(slot) {
        const key = slot || 'current';
        return withDB(
            async (db) => {
                const tx = db.transaction(STORE_WORLD, 'readwrite');
                tx.objectStore(STORE_WORLD).delete(key);
                await txP(tx);
                return true;
            },
            () => {
                try { global.localStorage.removeItem(LS_WORLD + ':' + key); return true; } catch (_) { return false; }
            }
        );
    }

    /**
     * 列出保存的图纸，按保存时间倒序。
     */
    async function listDesigns() {
        const list = await withDB(
            async (db) => {
                const tx = db.transaction(STORE_DESIGNS, 'readonly');
                const store = tx.objectStore(STORE_DESIGNS);
                const all = await reqP(store.getAll());
                return Array.isArray(all) ? all : [];
            },
            () => lsList(LS_DESIGNS)
        );
        const arr = Array.isArray(list) ? list : [];
        arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        return arr;
    }

    /**
     * 存一张图纸。obj 需要带 id 和 savedAt。
     */
    async function putDesign(obj) {
        if (!obj || !obj.id) return false;
        return withDB(
            async (db) => {
                const tx = db.transaction(STORE_DESIGNS, 'readwrite');
                tx.objectStore(STORE_DESIGNS).put(obj);
                await txP(tx);
                return true;
            },
            () => {
                const list = lsList(LS_DESIGNS).filter(x => x.id !== obj.id);
                list.push(obj);
                return lsWrite(LS_DESIGNS, list);
            }
        );
    }

    /**
     * 取一张图纸。
     */
    async function getDesign(id) {
        return withDB(
            async (db) => {
                const tx = db.transaction(STORE_DESIGNS, 'readonly');
                const rec = await reqP(tx.objectStore(STORE_DESIGNS).get(id));
                return rec || null;
            },
            () => lsList(LS_DESIGNS).find(x => x.id === id) || null
        );
    }

    /**
     * 删一张图纸。
     */
    async function deleteDesign(id) {
        return withDB(
            async (db) => {
                const tx = db.transaction(STORE_DESIGNS, 'readwrite');
                tx.objectStore(STORE_DESIGNS).delete(id);
                await txP(tx);
                return true;
            },
            () => {
                const list = lsList(LS_DESIGNS).filter(x => x.id !== id);
                return lsWrite(LS_DESIGNS, list);
            }
        );
    }

    global.WorldStore = {
        getWorld,
        putWorld,
        clearWorld,
        listDesigns,
        putDesign,
        getDesign,
        deleteDesign,
        mode: () => backend,
        isDegraded: () => degraded,
        STORE_WORLD,
        STORE_DESIGNS
    };

})(typeof window !== 'undefined' ? window : globalThis);
