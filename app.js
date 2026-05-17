/* ────────────────────────────────────────── DB ── */
const DB_NAME = "books_v1";
const DB_VERSION = 1;
const STORE = "books";

class BooksDB {
  constructor() { this.db = null; }
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("addedAt", "addedAt");
          store.createIndex("lastOpenedAt", "lastOpenedAt");
        }
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }
  put(book) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(book);
      tx.oncomplete = () => resolve(book);
      tx.onerror = () => reject(tx.error);
    });
  }
  get(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  getAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  remove(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

const db = new BooksDB();

/* ────────────────────────────────────────── HELPERS ── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const uid = () => "b_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toast._h);
  toast._h = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => { t.hidden = true; }, 220);
  }, ms);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtSize(b) {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}

function cleanFilename(name) {
  // Strip extension and try to recover a "title - author" structure if obvious.
  const base = name.replace(/\.[^.]+$/, "");
  // Common pattern: "(series #) Author - Title - Publisher (Year)"
  const m = base.match(/^(?:\([^)]+\)\s*)?([^-]+?)\s+-\s+(.+?)(?:\s*-\s*[^-]+)?$/);
  if (m) {
    let a = m[1].trim();
    let t = m[2].trim();
    // "Lastname, Firstname" → "Firstname Lastname"
    const c = a.match(/^([^,]+),\s*(.+)$/);
    if (c) a = c[2].trim() + " " + c[1].trim();
    // Strip publisher suffix from title
    t = t.replace(/\s*-\s*[^-]*\([12]\d{3}\)\s*$/, "");
    return { title: t, author: a };
  }
  return { title: base, author: "" };
}

/* ────────────────────────────────────────── SCREEN NAV ── */
function show(id) {
  $$(".screen").forEach(s => s.classList.toggle("active", s.id === id));
}

/* ────────────────────────────────────────── MODAL ── */
function openModal(id) {
  $("#" + id).classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  const m = id ? $("#" + id) : $(".modal.open");
  if (!m) return;
  m.classList.remove("open");
  document.body.style.overflow = "";
}
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) {
    const m = e.target.closest(".modal");
    if (m) closeModal(m.id);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ────────────────────────────────────────── SETTINGS ── */
const DEFAULT_SETTINGS = { theme: "cream", font: "serif", size: 0, flow: "paginated" };
const SETTINGS_KEY = "dreams.reader.settings.v1";

function loadSettings() {
  try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
  catch { return Object.assign({}, DEFAULT_SETTINGS); }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
const settings = loadSettings();

/* ────────────────────────────────────────── LIBRARY ── */
async function renderLibrary() {
  const books = await db.getAll();
  books.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));

  if (books.length === 0) {
    $("#empty-library").hidden = false;
    $("#hero").hidden = true;
    $("#books-section").hidden = true;
    return;
  }

  $("#empty-library").hidden = true;

  // Hero = most recently opened book (only if it's been opened at least once)
  const hero = books.find(b => b.lastOpenedAt);
  if (hero) {
    $("#hero").hidden = false;
    $("#hero-title").textContent = hero.title || "Untitled";
    $("#hero-author").textContent = hero.author || "";
    const pct = Math.round(((hero.progress && hero.progress.percent) || 0) * 100);
    $("#hero-progress").style.width = pct + "%";
    $("#hero-progress-label").textContent = pct + "% read";
    setCover($("#hero-cover"), hero);
    $("#hero-card").onclick = () => openBook(hero.id);
  } else {
    $("#hero").hidden = true;
  }

  // Grid
  $("#books-section").hidden = false;
  $("#books-count").textContent = `(${books.length})`;
  const grid = $("#books-grid");
  grid.innerHTML = "";

  for (const b of books) {
    const tile = document.createElement("button");
    tile.className = "book-tile";
    tile.dataset.id = b.id;
    const pct = Math.round(((b.progress && b.progress.percent) || 0) * 100);
    tile.innerHTML = `
      <div class="book-tile-cover" data-type="${escapeHtml(b.type)}">
        <span class="cover-title">${escapeHtml(b.title || "Untitled")}</span>
      </div>
      <div class="book-tile-title">${escapeHtml(b.title || "Untitled")}</div>
      <div class="book-tile-author">${escapeHtml(b.author || (b.type === "url" ? (b.siteName || "Article") : ""))}</div>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
    `;
    setCover(tile.querySelector(".book-tile-cover"), b);
    tile.addEventListener("click", () => openBook(b.id));
    grid.appendChild(tile);
  }
}

function setCover(el, book) {
  if (book.coverUrl) {
    el.innerHTML = `<img alt="" src="${book.coverUrl}" />`;
  } else {
    const t = (book.title || "").slice(0, 60);
    el.innerHTML = `<span class="cover-title">${escapeHtml(t)}</span>`;
  }
}

/* ────────────────────────────────────────── ADD MODAL ── */
$("#btn-open-add").addEventListener("click", () => {
  openModal("modal-add");
  loadFolder(currentFolder);
});
$("#empty-add").addEventListener("click", () => {
  openModal("modal-add");
  loadFolder(currentFolder);
});

$("#empty-sample").addEventListener("click", async () => {
  const btn = $("#empty-sample");
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    // Look for the smallest EPUB in the configured library folder, or fall back to defaults.
    let chosen = null;
    for (const dir of (defaultDirs.length ? defaultDirs : [])) {
      try {
        const r = await fetch("/api/list?dir=" + encodeURIComponent(dir));
        const data = await r.json();
        const eps = (data.files || []).filter(f => f.ext === ".epub");
        if (eps.length) {
          eps.sort((a, b) => a.size - b.size);
          chosen = eps[0];
          break;
        }
      } catch {}
    }
    if (!chosen) { toast("No EPUB sample found in default folders"); return; }
    await addServerFile(chosen);
    // Open it immediately so the reader is demonstrated
    const all = await db.getAll();
    const just = all.sort((a, b) => b.addedAt - a.addedAt)[0];
    if (just) openBook(just.id);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = "Try a sample";
  }
});

// tabs
$$(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach(t => t.classList.toggle("active", t === tab));
    const key = tab.dataset.tab;
    $$(".tab-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === key));
    if (key === "folder") loadFolder(currentFolder);
  });
});

/* ── file picker ── */
const fileDrop = $("#file-drop");
const fileInput = $("#file-input");
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) handlePickedFile(fileInput.files[0]);
  fileInput.value = "";
});
["dragenter", "dragover"].forEach(ev => {
  fileDrop.addEventListener(ev, e => { e.preventDefault(); fileDrop.classList.add("drag"); });
});
["dragleave", "drop"].forEach(ev => {
  fileDrop.addEventListener(ev, e => { e.preventDefault(); fileDrop.classList.remove("drag"); });
});
fileDrop.addEventListener("drop", e => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handlePickedFile(f);
});

async function handlePickedFile(file) {
  const lower = file.name.toLowerCase();
  let type;
  if (lower.endsWith(".epub")) type = "epub";
  else if (lower.endsWith(".pdf")) type = "pdf";
  else if (lower.endsWith(".txt")) type = "txt";
  else if (lower.endsWith(".md")) type = "md";
  else if (lower.endsWith(".html") || lower.endsWith(".htm")) type = "html";
  else { toast("Unsupported file type"); return; }

  const guess = cleanFilename(file.name);
  const book = {
    id: uid(),
    type, title: guess.title, author: guess.author,
    source: "blob",
    blob: file,
    blobMime: file.type || "",
    size: file.size,
    addedAt: Date.now(),
    progress: {},
  };
  await enrichBookMetadata(book);
  await db.put(book);
  closeModal("modal-add");
  toast("Added: " + book.title);
  await renderLibrary();
}

/* ── folder browser ── */
let currentFolder = null;

async function loadFolder(dir) {
  const listing = $("#folder-listing");
  listing.innerHTML = `<div class="muted small" style="padding:14px">Loading…</div>`;
  try {
    let url = "/api/list";
    if (dir) url += "?dir=" + encodeURIComponent(dir);
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) {
      listing.innerHTML = `<div class="muted small" style="padding:14px">${escapeHtml(data.error)}</div>`;
      return;
    }
    currentFolder = data.dir;
    $("#folder-path").value = data.dir;
    renderFolderQuick();
    renderFolderListing(data);
  } catch (e) {
    listing.innerHTML = `<div class="muted small" style="padding:14px">${escapeHtml(String(e))}</div>`;
  }
}

function renderFolderQuick() {
  const quick = $("#folder-quick");
  quick.innerHTML = "";
  defaultDirs.forEach(p => {
    const b = document.createElement("button");
    b.textContent = shortPath(p);
    b.title = p;
    b.onclick = () => loadFolder(p);
    quick.appendChild(b);
  });
}

function shortPath(p) {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.slice(-2).join("/") || p;
}

function renderFolderListing(data) {
  const listing = $("#folder-listing");
  listing.innerHTML = "";
  if (data.parent) {
    const row = document.createElement("div");
    row.className = "folder-row is-folder";
    row.innerHTML = `<span class="row-icon">↑</span><span class="row-name">..</span><span class="row-meta">parent</span>`;
    row.onclick = () => loadFolder(data.parent);
    listing.appendChild(row);
  }
  data.folders.forEach(f => {
    const row = document.createElement("div");
    row.className = "folder-row is-folder";
    row.innerHTML = `<span class="row-icon">▸</span><span class="row-name">${escapeHtml(f.name)}</span>`;
    row.onclick = () => loadFolder(f.path);
    listing.appendChild(row);
  });
  data.files.forEach(f => {
    const row = document.createElement("div");
    row.className = "folder-row";
    const ext = f.ext.replace(".", "").toUpperCase();
    row.innerHTML = `<span class="row-icon">${ext}</span><span class="row-name">${escapeHtml(f.name)}</span><span class="row-meta">${fmtSize(f.size)}</span>`;
    row.onclick = () => addServerFile(f);
    listing.appendChild(row);
  });
  if (!data.folders.length && !data.files.length) {
    listing.innerHTML += `<div class="muted small" style="padding:14px">No books in this folder.</div>`;
  }

  // Bulk-add bar
  const bulk = $("#folder-bulk");
  const addAll = $("#add-all-here");
  const addRec = $("#add-all-recursive");
  if (data.files.length || data.folders.length) {
    bulk.hidden = false;
    addAll.textContent = data.files.length
      ? `Add all ${data.files.length} in this folder`
      : "(no books here)";
    addAll.disabled = data.files.length === 0;
    addAll.onclick = () => bulkAddFromFolder(data.files);
    addRec.hidden = data.folders.length === 0;
    addRec.onclick = () => bulkAddRecursive(data.dir);
  } else {
    bulk.hidden = true;
  }
}

async function bulkAddFromFolder(files) {
  const btn = $("#add-all-here");
  const prev = btn.textContent;
  btn.disabled = true;
  try {
    const added = await bulkAddFiles(files, (done, total) => {
      btn.textContent = `Adding ${done}/${total}…`;
    });
    closeModal("modal-add");
    toast(`Added ${added} book${added === 1 ? "" : "s"}`);
    await renderLibrary();
  } catch (e) {
    console.error(e);
    toast("Bulk add failed: " + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function bulkAddRecursive(rootDir) {
  const btn = $("#add-all-recursive");
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Walking subfolders…";
  try {
    const files = await walkForBooks(rootDir, 6);
    if (!files.length) { toast("No books found"); return; }
    btn.textContent = `Adding ${files.length}…`;
    const added = await bulkAddFiles(files, (done, total) => {
      btn.textContent = `Adding ${done}/${total}…`;
    });
    closeModal("modal-add");
    toast(`Added ${added} book${added === 1 ? "" : "s"} from ${rootDir}`);
    await renderLibrary();
  } catch (e) {
    console.error(e);
    toast("Recursive add failed: " + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function walkForBooks(dir, maxDepth) {
  const out = [];
  const visited = new Set();
  async function visit(d, depth) {
    if (depth > maxDepth || visited.has(d)) return;
    visited.add(d);
    try {
      const r = await fetch("/api/list?dir=" + encodeURIComponent(d));
      const data = await r.json();
      if (data.files) out.push(...data.files);
      if (data.folders) {
        for (const f of data.folders) await visit(f.path, depth + 1);
      }
    } catch {}
  }
  await visit(dir, 0);
  return out;
}

async function bulkAddFiles(files, onProgress) {
  // Skip per-book enrichment for speed; rely on filename for title/author.
  const existing = await db.getAll();
  const existingPaths = new Set(
    existing.filter(b => b.source === "serverpath").map(b => b.serverPath)
  );
  let added = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (existingPaths.has(f.path)) continue;
    const ext = f.ext.slice(1).toLowerCase();
    let type = ext;
    if (ext === "htm") type = "html";
    if (!["epub", "pdf", "txt", "md", "html"].includes(type)) continue;
    const guess = cleanFilename(f.name);
    const book = {
      id: uid(),
      type, title: guess.title, author: guess.author,
      source: "serverpath", serverPath: f.path,
      size: f.size,
      addedAt: Date.now() - (files.length - i),  // stable sort by listing order
      progress: {},
    };
    try {
      await db.put(book);
      existingPaths.add(f.path);
      added++;
      if (onProgress && added % 20 === 0) onProgress(added, files.length);
    } catch (e) {
      console.warn("bulk add failed for", f.path, e);
    }
  }
  if (onProgress) onProgress(added, files.length);
  return added;
}

$("#folder-up").addEventListener("click", () => {
  // Synthesize parent by stripping trailing path segment
  if (!currentFolder) return;
  const cleaned = currentFolder.replace(/[\\/]+$/, "");
  const parent = cleaned.replace(/[\\/][^\\/]+$/, "");
  if (parent && parent !== cleaned) loadFolder(parent);
});
$("#folder-go").addEventListener("click", () => {
  loadFolder($("#folder-path").value.trim());
});
$("#folder-path").addEventListener("keydown", e => {
  if (e.key === "Enter") loadFolder($("#folder-path").value.trim());
});

async function addServerFile(file) {
  const ext = file.ext.slice(1).toLowerCase();
  let type = ext;
  if (ext === "html" || ext === "htm") type = "html";
  const guess = cleanFilename(file.name);
  const book = {
    id: uid(),
    type, title: guess.title, author: guess.author,
    source: "serverpath",
    serverPath: file.path,
    size: file.size,
    addedAt: Date.now(),
    progress: {},
  };
  toast("Adding " + book.title + "…");
  try {
    await enrichBookMetadata(book);
  } catch (e) {
    console.warn("metadata enrich failed", e);
  }
  await db.put(book);
  closeModal("modal-add");
  toast("Added: " + book.title);
  await renderLibrary();
}

/* ── URL article ── */
$("#url-add").addEventListener("click", addUrlArticle);
$("#url-input").addEventListener("keydown", e => { if (e.key === "Enter") addUrlArticle(); });

async function addUrlArticle() {
  const btn = $("#url-add");
  const url = $("#url-input").value.trim();
  if (!url) return;
  btn.disabled = true; btn.textContent = "Fetching…";
  try {
    const resp = await fetch("/api/fetch?url=" + encodeURIComponent(url));
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error("Server returned " + resp.status + ": " + t.slice(0, 200));
    }
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const base = doc.createElement("base");
    base.href = url;
    doc.head.insertBefore(base, doc.head.firstChild);
    const reader = new Readability(doc.cloneNode(true));
    const article = reader.parse();
    if (!article) throw new Error("Couldn't extract an article from that page");

    const book = {
      id: uid(),
      type: "url",
      title: article.title || "Article",
      author: article.byline || "",
      siteName: article.siteName || new URL(url).hostname,
      source: "url",
      url,
      contentHtml: article.content,
      textContent: article.textContent,
      size: (article.textContent || "").length,
      addedAt: Date.now(),
      progress: {},
    };
    await db.put(book);
    closeModal("modal-add");
    toast("Added: " + book.title);
    $("#url-input").value = "";
    await renderLibrary();
  } catch (e) {
    console.error(e);
    toast(String(e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = "Add article";
  }
}

/* ────────────────────────────────────────── METADATA ENRICHMENT ── */
async function enrichBookMetadata(book) {
  const src = await sourceUrl(book);
  if (!src) return;
  try {
    if (book.type === "epub") {
      if (!window.ePub) return;
      const buf = await (await fetch(src)).arrayBuffer();
      const ep = ePub(buf);
      await ep.ready;
      const meta = (ep.packaging && ep.packaging.metadata) || (ep.package && ep.package.metadata);
      if (meta) {
        if (meta.title) book.title = meta.title;
        if (meta.creator) book.author = meta.creator;
      }
      try {
        const coverUrl = await ep.coverUrl();
        if (coverUrl) {
          const r = await fetch(coverUrl);
          const blob = await r.blob();
          book.coverUrl = await blobToDataUrl(blob);
        }
      } catch {}
      try { ep.destroy(); } catch {}
    } else if (book.type === "pdf") {
      if (!window.pdfjsLib) return;
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument(src).promise;
      try {
        const md = await pdf.getMetadata();
        if (md.info) {
          if (md.info.Title) book.title = md.info.Title;
          if (md.info.Author) book.author = md.info.Author;
        }
      } catch {}
      book.pageCount = pdf.numPages;
      try { pdf.destroy(); } catch {}
    }
  } catch (e) {
    console.warn("enrich failed", e);
  } finally {
    if (book.source === "blob" && src.startsWith("blob:")) URL.revokeObjectURL(src);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function sourceUrl(book) {
  if (book.source === "blob" && book.blob) return URL.createObjectURL(book.blob);
  if (book.source === "serverpath" && book.serverPath) return "/api/file?path=" + encodeURIComponent(book.serverPath);
  return null;
}

/* ────────────────────────────────────────── READER ── */
let current = null; // { book, type, rendition?, pdf?, container?, observer?, sourceUrl? }

async function openBook(id) {
  const book = await db.get(id);
  if (!book) { toast("Book not found"); return; }
  book.lastOpenedAt = Date.now();
  await db.put(book);

  current = { book, type: book.type };
  show("screen-reader");
  applyReaderTheme();
  $("#reader-title").textContent = book.title || "";
  initCardHeader(book);
  $("#reader-loading").hidden = false;
  $("#reader-frame").innerHTML = "";

  try {
    if (book.type === "epub") await renderEpub(book);
    else if (book.type === "pdf") await renderPdf(book);
    else if (book.type === "txt" || book.type === "md") await renderPlainText(book);
    else if (book.type === "url") renderArticle(book);
    else if (book.type === "html") await renderHtml(book);
    else throw new Error("Unsupported type: " + book.type);
  } catch (e) {
    console.error(e);
    $("#reader-loading").hidden = false;
    $("#reader-loading").textContent = "Couldn't open: " + (e.message || e);
  }
}

function applyReaderTheme() {
  const screen = $("#screen-reader");
  screen.dataset.theme = settings.theme;
  screen.dataset.flow = settings.flow;
  const frame = $("#reader-frame");
  frame.dataset.font = settings.font;
  if (current && current.rendition) reapplyEpubTheme();
}

function effectiveEpubFlow() {
  // In stack mode we paginate the EPUB so it fits inside the card.
  if (settings.flow === "scrolled") return "scrolled";
  return "paginated";
}

async function renderEpub(book) {
  const src = await sourceUrl(book);
  if (!src) throw new Error("Source unavailable");
  current.sourceUrl = src;

  const frame = $("#reader-frame");
  const flow = effectiveEpubFlow();
  frame.dataset.mode = flow;
  frame.innerHTML = "";

  // Fetch as ArrayBuffer so epub.js doesn't have to guess the type from the URL
  const buf = await (await fetch(src)).arrayBuffer();
  const epubBook = ePub(buf);
  const rendition = epubBook.renderTo(frame, {
    width: "100%",
    height: "100%",
    flow,
    manager: flow === "scrolled" ? "continuous" : "default",
    spread: "none",
    allowScriptedContent: false,
  });

  current.rendition = rendition;
  current.epubBook = epubBook;

  registerEpubThemes(rendition);
  rendition.themes.select(settings.theme);
  rendition.themes.fontSize(fontSizePct());
  rendition.themes.font(settings.font === "sans" ? "Inter, system-ui, sans-serif" : "Lora, Cormorant Garamond, Georgia, serif");

  const startAt = book.progress && book.progress.cfi;
  await rendition.display(startAt || undefined);

  // Try to generate locations for better percent tracking
  epubBook.ready.then(() => {
    if (!epubBook.locations.length()) {
      epubBook.locations.generate(1024).catch(() => {});
    }
  });

  rendition.on("relocated", (location) => {
    if (!location) return;
    let percent = location.start && location.start.percentage;
    if ((percent == null || percent === 0) && epubBook.locations.length()) {
      percent = epubBook.locations.percentageFromCfi(location.start.cfi);
    }
    if (percent == null) percent = 0;
    book.progress = book.progress || {};
    book.progress.cfi = location.start.cfi;
    book.progress.percent = percent;
    saveBookProgress(book);
    updateProgress(percent, locationLabel(location));
    updateCardHeader(book, location);
  });

  rendition.on("rendered", () => {
    $("#reader-loading").hidden = true;
  });
}

async function updateCardHeader(book, location) {
  if (settings.flow !== "stack") {
    $("#card-meta-left").textContent = "";
    $("#card-meta-right").textContent = "";
    return;
  }
  let title = book.title || "";
  let position = "";
  if (current && current.epubBook && location && location.start) {
    try {
      // Look up the chapter title from the book's nav by matching href
      const nav = await current.epubBook.loaded.navigation;
      const href = location.start.href;
      const item = findNavItem(nav.toc, href);
      if (item && item.label) title = item.label.trim();
    } catch {}
    if (location.start.displayed) {
      position = `${location.start.displayed.page}/${location.start.displayed.total}`;
    }
  }
  $("#card-meta-left").textContent = title;
  $("#card-meta-right").textContent = position || (book.author || "");
}

function findNavItem(toc, href) {
  if (!toc) return null;
  for (const item of toc) {
    if (item.href && href && (item.href === href || href.indexOf(item.href.split("#")[0]) >= 0 || item.href.split("#")[0].indexOf(href.split("#")[0]) >= 0)) return item;
    if (item.subitems && item.subitems.length) {
      const sub = findNavItem(item.subitems, href);
      if (sub) return sub;
    }
  }
  return null;
}

function locationLabel(loc) {
  if (loc.start && loc.start.displayed) {
    return `${loc.start.displayed.page}/${loc.start.displayed.total}`;
  }
  return "";
}

function fontSizePct() {
  const base = 100 + settings.size * 14;
  return base + "%";
}

function registerEpubThemes(rendition) {
  rendition.themes.register("cream", {
    "body": { background: "#e2dcc6 !important", color: "#2a261f !important", "padding": "1em !important", "line-height": "1.7" },
    "p, div, span, li": { color: "#2a261f !important", "line-height": "1.7" },
    "a": { color: "#2a261f !important", "text-decoration": "underline" },
    "h1, h2, h3, h4, h5, h6": { color: "#1f1c16 !important", "font-family": "Cormorant Garamond, Georgia, serif !important" },
    "img": { "max-width": "100% !important", "height": "auto !important" },
  });
  rendition.themes.register("sepia", {
    "body": { background: "#f4e8d0 !important", color: "#3a2f1d !important", "padding": "1em !important", "line-height": "1.7" },
    "p, div, span, li": { color: "#3a2f1d !important", "line-height": "1.7" },
    "a": { color: "#3a2f1d !important" },
    "h1, h2, h3, h4, h5, h6": { color: "#2a2113 !important" },
    "img": { "max-width": "100% !important" },
  });
  rendition.themes.register("dark", {
    "body": { background: "#18181c !important", color: "#d4d1c7 !important", "padding": "1em !important", "line-height": "1.7" },
    "p, div, span, li": { color: "#d4d1c7 !important", "line-height": "1.7" },
    "a": { color: "#d6cfb8 !important" },
    "h1, h2, h3, h4, h5, h6": { color: "#f3f1ec !important" },
    "img": { "max-width": "100% !important", "filter": "brightness(0.8)" },
  });
}

function reapplyEpubTheme() {
  if (!current || !current.rendition) return;
  current.rendition.themes.select(settings.theme);
  current.rendition.themes.fontSize(fontSizePct());
  current.rendition.themes.font(settings.font === "sans" ? "Inter, system-ui, sans-serif" : "Lora, Cormorant Garamond, Georgia, serif");
}

async function renderPdf(book) {
  const src = await sourceUrl(book);
  if (!src) throw new Error("Source unavailable");
  current.sourceUrl = src;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const pdf = await pdfjsLib.getDocument(src).promise;
  current.pdf = pdf;

  const frame = $("#reader-frame");
  frame.removeAttribute("data-mode");
  frame.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "pdf-pages";
  frame.appendChild(wrap);

  const placeholders = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const ph = document.createElement("div");
    ph.style.width = "100%";
    ph.style.maxWidth = "780px";
    ph.style.aspectRatio = "0.71";
    ph.style.background = "rgba(255,255,255,0.5)";
    ph.style.borderRadius = "4px";
    ph.style.boxShadow = "0 2px 10px -4px rgba(0,0,0,0.3)";
    ph.dataset.page = String(i);
    wrap.appendChild(ph);
    placeholders.push(ph);
  }

  $("#reader-loading").hidden = true;

  const observer = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const ph = entry.target;
      if (ph.dataset.rendered) continue;
      ph.dataset.rendered = "1";
      const pageNum = parseInt(ph.dataset.page, 10);
      try {
        const page = await pdf.getPage(pageNum);
        const vp1 = page.getViewport({ scale: 1 });
        const w = Math.min(ph.offsetWidth || 720, 780);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.max(0.8, (w / vp1.width) * dpr);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        canvas.style.width = "100%";
        canvas.style.maxWidth = "780px";
        canvas.style.height = "auto";
        const ctx = canvas.getContext("2d");
        ph.replaceWith(canvas);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      } catch (e) {
        console.warn("pdf page", pageNum, "failed", e);
      }
    }
  }, { root: frame, rootMargin: "800px 0px" });

  placeholders.forEach(p => observer.observe(p));
  current.observer = observer;

  // Restore scroll position
  await new Promise(r => requestAnimationFrame(r));
  const sp = book.progress && book.progress.scrollTop;
  if (sp) frame.scrollTop = sp;
  current.scrollEl = frame;

  frame.addEventListener("scroll", onScrollProgress);
  updateProgressFromScroll();
}

async function renderPlainText(book) {
  const src = await sourceUrl(book);
  let text;
  if (book.blob) text = await book.blob.text();
  else if (src) text = await (await fetch(src)).text();
  else text = book.textContent || "";

  const frame = $("#reader-frame");
  frame.removeAttribute("data-mode");
  frame.innerHTML = "";
  const div = document.createElement("div");
  div.className = "reader-text";
  if (book.type === "md") {
    div.innerHTML = simpleMarkdown(text);
  } else {
    div.textContent = text;
  }
  frame.appendChild(div);
  $("#reader-loading").hidden = true;

  await new Promise(r => requestAnimationFrame(r));
  const sp = book.progress && book.progress.scrollTop;
  if (sp) frame.scrollTop = sp;
  current.scrollEl = frame;
  frame.addEventListener("scroll", onScrollProgress);
  updateProgressFromScroll();
}

function renderArticle(book) {
  const frame = $("#reader-frame");
  frame.removeAttribute("data-mode");
  frame.innerHTML = "";
  const div = document.createElement("div");
  div.className = "reader-text";
  const meta = book.author || book.siteName
    ? `<p style="color: var(--paper-text-muted); font-size: 13px; margin-bottom: 1.5em">${escapeHtml(book.author || "")} ${book.siteName ? " · " + escapeHtml(book.siteName) : ""} <a href="${escapeHtml(book.url)}" target="_blank" rel="noopener" style="margin-left: 8px">open original ↗</a></p>`
    : "";
  div.innerHTML = `<h1>${escapeHtml(book.title)}</h1>${meta}${book.contentHtml || ""}`;
  frame.appendChild(div);
  $("#reader-loading").hidden = true;

  requestAnimationFrame(() => {
    const sp = book.progress && book.progress.scrollTop;
    if (sp) frame.scrollTop = sp;
  });
  current.scrollEl = frame;
  frame.addEventListener("scroll", onScrollProgress);
  updateProgressFromScroll();
}

async function renderHtml(book) {
  const src = await sourceUrl(book);
  let text;
  if (book.blob) text = await book.blob.text();
  else if (src) text = await (await fetch(src)).text();
  else text = "";
  const frame = $("#reader-frame");
  frame.removeAttribute("data-mode");
  frame.innerHTML = "";
  const div = document.createElement("div");
  div.className = "reader-text";
  // Run through readability so it focuses on the content
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const article = new Readability(doc).parse();
    if (article && article.content) {
      div.innerHTML = `<h1>${escapeHtml(article.title || book.title || "")}</h1>${article.content}`;
    } else {
      div.innerHTML = text;
    }
  } catch {
    div.innerHTML = text;
  }
  frame.appendChild(div);
  $("#reader-loading").hidden = true;
  current.scrollEl = frame;
  frame.addEventListener("scroll", onScrollProgress);
  updateProgressFromScroll();
  initCardHeader(current.book);
}

function simpleMarkdown(s) {
  // Just a tiny conversion. Real markdown belongs to a library, but this is good enough for plain text.
  return escapeHtml(s)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>").concat("</p>");
}

function onScrollProgress() {
  if (!current || !current.scrollEl) return;
  updateProgressFromScroll();
  if (!current.book) return;
  current.book.progress = current.book.progress || {};
  current.book.progress.scrollTop = current.scrollEl.scrollTop;
  current.book.progress.percent = scrollPercent();
  saveBookProgress(current.book);
  if (settings.flow === "stack") {
    $("#card-meta-right").textContent = Math.round(scrollPercent() * 100) + "%";
  }
}

function initCardHeader(book) {
  if (settings.flow !== "stack") return;
  $("#card-meta-left").textContent = book.title || "";
  $("#card-meta-right").textContent = book.author || (book.siteName || "");
}

function scrollPercent() {
  const el = current.scrollEl;
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

function updateProgressFromScroll() {
  const pct = scrollPercent();
  updateProgress(pct, "");
}

function updateProgress(pct, label) {
  const p = Math.max(0, Math.min(1, pct || 0));
  $("#reader-progress").style.width = (p * 100).toFixed(1) + "%";
  $("#reader-progress-label").textContent = Math.round(p * 100) + "%";
  $("#reader-page-label").textContent = label || "";
}

let saveProgressTimer = null;
function saveBookProgress(book) {
  clearTimeout(saveProgressTimer);
  saveProgressTimer = setTimeout(() => { db.put(book); }, 400);
}

/* ── reader controls ── */
$("#btn-back").addEventListener("click", closeReader);
$("#btn-settings").addEventListener("click", () => openModal("modal-settings"));

function closeReader() {
  if (current && current.rendition) {
    try { current.rendition.destroy(); } catch {}
  }
  if (current && current.observer) current.observer.disconnect();
  if (current && current.scrollEl) current.scrollEl.removeEventListener("scroll", onScrollProgress);
  if (current && current.sourceUrl && current.sourceUrl.startsWith("blob:")) {
    URL.revokeObjectURL(current.sourceUrl);
  }
  current = null;
  show("screen-library");
  renderLibrary();
}

// Pagination taps for EPUB
$("#page-prev").addEventListener("click", () => {
  if (current && current.rendition) current.rendition.prev();
});
$("#page-next").addEventListener("click", () => {
  if (current && current.rendition) current.rendition.next();
});

// Keyboard shortcuts in reader
document.addEventListener("keydown", (e) => {
  if (!$("#screen-reader").classList.contains("active")) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
    if (current && current.rendition) { e.preventDefault(); current.rendition.next(); }
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    if (current && current.rendition) { e.preventDefault(); current.rendition.prev(); }
  } else if (e.key === "Escape") {
    closeReader();
  }
});

// progress track click → seek
$("#progress-track").addEventListener("click", (e) => {
  if (!current) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  if (current.rendition && current.epubBook && current.epubBook.locations.length()) {
    const cfi = current.epubBook.locations.cfiFromPercentage(pct);
    current.rendition.display(cfi);
  } else if (current.scrollEl) {
    const el = current.scrollEl;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * pct;
  }
});

/* ── settings ── */
function initSegs() {
  segBind("#seg-theme", "theme");
  segBind("#seg-font", "font");
  segBind("#seg-size", "size", v => parseInt(v, 10));
  segBind("#seg-flow", "flow");
  syncSegs();
}
function segBind(sel, key, parse = v => v) {
  $$(sel + " button").forEach(b => {
    b.addEventListener("click", () => {
      const v = parse(b.dataset.value);
      settings[key] = v;
      saveSettings(settings);
      syncSegs();
      applyReaderTheme();
      if (key === "flow" && current && current.book) {
        const id = current.book.id;
        closeReader();
        openBook(id);
      }
    });
  });
}
function syncSegs() {
  $$("#seg-theme button").forEach(b => b.classList.toggle("active", b.dataset.value === settings.theme));
  $$("#seg-font button").forEach(b => b.classList.toggle("active", b.dataset.value === settings.font));
  $$("#seg-size button").forEach(b => b.classList.toggle("active", parseInt(b.dataset.value, 10) === settings.size));
  $$("#seg-flow button").forEach(b => b.classList.toggle("active", b.dataset.value === settings.flow));
}

$("#delete-book").addEventListener("click", async () => {
  if (!current || !current.book) return;
  if (!confirm("Remove '" + current.book.title + "' from your library?")) return;
  const id = current.book.id;
  await db.remove(id);
  closeModal("modal-settings");
  closeReader();
  toast("Removed");
});

/* ────────────────────────────────────────── BOOT ── */
let defaultDirs = [];

(async function boot() {
  try { await db.open(); }
  catch (e) {
    toast("Could not open storage");
    console.error(e);
    return;
  }

  // Get server-side defaults (home dir, suggested folders)
  try {
    const r = await fetch("/api/home");
    const j = await r.json();
    defaultDirs = j.defaults || [];
    currentFolder = defaultDirs[0] || j.home;
  } catch (e) {
    console.warn("Server APIs not reachable; run via Dreams.bat for full features.");
    defaultDirs = [];
    currentFolder = null;
  }

  initSegs();
  await renderLibrary();
})();
