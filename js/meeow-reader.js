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

    const splitReaderParagraphs = (text) => String(text || '').replace(/\r/g, '').split(/\n\s*\n|\n/)
        .map(line => line.replace(/\s+/g, ' ').trim()).filter(line => line.length > 0);
    const splitReaderChapter = (title, paragraphs, seed) => {
        const chunks = []; let current = []; let charCount = 0;
        paragraphs.forEach(paragraph => {
            if (current.length && (charCount + paragraph.length > 5200 || current.length >= 48)) {
                chunks.push(current); current = []; charCount = 0;
            }
            current.push(paragraph); charCount += paragraph.length;
        });
        if (current.length) chunks.push(current);
        return chunks.map((chunk, index) => ({
            id: `${seed}-${index + 1}`,
            title: chunks.length > 1 ? `${title}（${index + 1}/${chunks.length}）` : title,
            paragraphs: chunk,
            paragraphCount: chunk.length
        }));
    };
    const parseTxtBook = (text, title) => {
        const lines = String(text || '').replace(/\r/g, '').split('\n');
        const heading = /^(?:第[\d一二三四五六七八九十百千万零〇两]+[章节回卷部篇]|chapter\s+\d+\b)/i;
        const raw = []; let currentTitle = ''; let bucket = [];
        const commit = () => {
            if (!bucket.length) return;
            raw.push({ title: currentTitle || `阅读片段 ${raw.length + 1}`, paragraphs: bucket });
            bucket = [];
        };
        lines.forEach(line => {
            const clean = line.trim();
            if (heading.test(clean)) { commit(); currentTitle = clean; }
            else if (clean) bucket.push(clean.replace(/\s+/g, ' '));
        });
        commit();
        if (!raw.length) raw.push({ title: title || '正文', paragraphs: splitReaderParagraphs(text) });
        return raw.flatMap((chapter, index) => splitReaderChapter(chapter.title, chapter.paragraphs, `txt-${index + 1}`));
    };
    const resolveEpubPath = (base, href) => {
        const stack = String(base || '').split('/').filter(Boolean);
        String(href || '').split('/').forEach(part => {
            if (!part || part === '.') return;
            if (part === '..') stack.pop(); else stack.push(part);
        });
        return stack.join('/');
    };
    const parseEpubBook = async (file) => {
        if (!window.JSZip) throw new Error('EPUB 解析组件未加载，请检查网络后重试。');
        const zip = await window.JSZip.loadAsync(file);
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) throw new Error('这不是有效的 EPUB：缺少容器文件。');
        const container = new DOMParser().parseFromString(await containerFile.async('text'), 'application/xml');
        const rootPath = container.querySelector('rootfile')?.getAttribute('full-path');
        if (!rootPath) throw new Error('这不是有效的 EPUB：找不到书籍目录。');
        const opfFile = zip.file(rootPath);
        if (!opfFile) throw new Error('EPUB 目录无法读取。');
        const opf = new DOMParser().parseFromString(await opfFile.async('text'), 'application/xml');
        const title = opf.querySelector('metadata > title, title')?.textContent?.trim() || file.name.replace(/\.epub$/i, '未命名 EPUB');
        const manifest = new Map([...opf.querySelectorAll('manifest > item')].map(item => [item.getAttribute('id'), item.getAttribute('href')]));
        const base = rootPath.split('/').slice(0, -1).join('/');
        const chapters = [];
        for (const itemref of opf.querySelectorAll('spine > itemref')) {
            const href = manifest.get(itemref.getAttribute('idref'));
            if (!href) continue;
            const chapterFile = zip.file(resolveEpubPath(base, href));
            if (!chapterFile) continue;
            const document = new DOMParser().parseFromString(await chapterFile.async('text'), 'text/html');
            const body = document.body;
            const chapterTitle = body?.querySelector('h1,h2,h3,title')?.textContent?.replace(/\s+/g, ' ').trim() || `章节 ${chapters.length + 1}`;
            const paragraphs = [...body.querySelectorAll('p,blockquote,li')].map(node => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
            const usable = paragraphs.length ? paragraphs : splitReaderParagraphs(body?.textContent || '');
            if (usable.length) chapters.push(...splitReaderChapter(chapterTitle, usable, `epub-${chapters.length + 1}`));
        }
        if (!chapters.length) throw new Error('这本 EPUB 没有可读取的正文。');
        return { title, chapters };
    };

    Object.assign(reader, {
        openReaderDB,
        putReaderPayload,
        getReaderPayload,
        splitReaderParagraphs,
        splitReaderChapter,
        parseTxtBook,
        resolveEpubPath,
        parseEpubBook
    });
}(window));
