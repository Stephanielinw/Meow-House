(function (global) {
    const Meeow = global.Meeow = global.Meeow || {};
    const reader = Meeow.reader = Meeow.reader || {};

    const READER_DB_NAME = 'meeow_house_reader_books_v1';
    const READER_DB_STORE = 'books';
    let readerDbPromise = null;

    const openReaderDB = () => {
        if (readerDbPromise) return readerDbPromise;
        readerDbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) return reject(new Error('当前浏览器不支持本地书库（IndexedDB）。'));
            const request = indexedDB.open(READER_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(READER_DB_STORE)) db.createObjectStore(READER_DB_STORE, { keyPath: 'id' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('本地书库无法打开。'));
        });
        return readerDbPromise;
    };

    const putReaderPayload = async (id, payload) => {
        const db = await openReaderDB();
        return new Promise((resolve, reject) => {
            const request = db.transaction(READER_DB_STORE, 'readwrite').objectStore(READER_DB_STORE).put({ id, payload, updatedAt: Date.now() });
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error || new Error('书籍正文保存失败。'));
        });
    };

    const getReaderPayload = async (id) => {
        const db = await openReaderDB();
        return new Promise((resolve, reject) => {
            const request = db.transaction(READER_DB_STORE, 'readonly').objectStore(READER_DB_STORE).get(id);
            request.onsuccess = () => resolve(request.result?.payload || null);
            request.onerror = () => reject(request.error || new Error('书籍正文读取失败。'));
        });
    };

    Object.assign(reader, {
        openReaderDB,
        putReaderPayload,
        getReaderPayload
    });
}(window));
