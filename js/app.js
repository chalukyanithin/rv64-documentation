/**
 * RV64 Documentation - Client-side Application Controller
 * Pure Frontend Architecture (Zero Backend, Zero Env Variables)
 */

(function () {
  'use strict';

  // 1. RV64 Register Metadata for the Interactive Inspector
  const RV64_REGISTERS = [
    { num: 0, name: "zero", saver: "-", desc: "Hardwired zero, writes discarded" },
    { num: 1, name: "ra", saver: "Caller", desc: "Return address for JAL / JALR" },
    { num: 2, name: "sp", saver: "Callee", desc: "Stack pointer (aligned to 16 bytes)" },
    { num: 3, name: "gp", saver: "-", desc: "Global pointer for GP-relative addressing" },
    { num: 4, name: "tp", saver: "-", desc: "Thread pointer for thread-local storage" },
    { num: 5, name: "t0", saver: "Caller", desc: "Temporary register / alternate link" },
    { num: 6, name: "t1", saver: "Caller", desc: "Temporary register" },
    { num: 7, name: "t2", saver: "Caller", desc: "Temporary register" },
    { num: 8, name: "s0/fp", saver: "Callee", desc: "Saved register or Frame Pointer" },
    { num: 9, name: "s1", saver: "Callee", desc: "Saved register" },
    { num: 10, name: "a0", saver: "Caller", desc: "Function argument 0 / Return value 0" },
    { num: 11, name: "a1", saver: "Caller", desc: "Function argument 1 / Return value 1" },
    { num: 12, name: "a2", saver: "Caller", desc: "Function argument 2" },
    { num: 13, name: "a3", saver: "Caller", desc: "Function argument 3" },
    { num: 14, name: "a4", saver: "Caller", desc: "Function argument 4" },
    { num: 15, name: "a5", saver: "Caller", desc: "Function argument 5" },
    { num: 16, name: "a6", saver: "Caller", desc: "Function argument 6" },
    { num: 17, name: "a7", saver: "Caller", desc: "Function argument 7 / System Call ID" },
    { num: 18, name: "s2", saver: "Callee", desc: "Saved register 2" },
    { num: 19, name: "s3", saver: "Callee", desc: "Saved register 3" },
    { num: 20, name: "s4", saver: "Callee", desc: "Saved register 4" },
    { num: 21, name: "s5", saver: "Callee", desc: "Saved register 5" },
    { num: 22, name: "s6", saver: "Callee", desc: "Saved register 6" },
    { num: 23, name: "s7", saver: "Callee", desc: "Saved register 7" },
    { num: 24, name: "s8", saver: "Callee", desc: "Saved register 8" },
    { num: 25, name: "s9", saver: "Callee", desc: "Saved register 9" },
    { num: 26, name: "s10", saver: "Callee", desc: "Saved register 10" },
    { num: 27, name: "s11", saver: "Callee", desc: "Saved register 11" },
    { num: 28, name: "t3", saver: "Caller", desc: "Temporary register 3" },
    { num: 29, name: "t4", saver: "Caller", desc: "Temporary register 4" },
    { num: 30, name: "t5", saver: "Caller", desc: "Temporary register 5" },
    { num: 31, name: "t6", saver: "Caller", desc: "Temporary register 6" },
    { num: 32, name: "pc", saver: "-", desc: "64-bit Program Counter (Reset: 0x80000000)" }
  ];

  // Load custom imported docs from localStorage if any (window.DOCS_DATABASE is always authoritative)
  let docs = window.DOCS_DATABASE ? [...window.DOCS_DATABASE] : [];
  try {
    const saved = localStorage.getItem("rv64_custom_docs");
    if (saved) {
      const customDocs = JSON.parse(saved);
      // Remove any custom doc whose id collides with built-in modules to avoid stale overrides
      const validCustom = customDocs.filter(cd => !docs.some(d => d.id === cd.id));
      if (validCustom.length !== customDocs.length) {
        localStorage.setItem("rv64_custom_docs", JSON.stringify(validCustom));
      }
      validCustom.forEach(cd => docs.push(cd));
    }
  } catch (e) {
    console.warn("Storage access failed:", e);
  }

  // DOM Elements
  const navContainer = document.getElementById("sidebar-nav");
  const articleContainer = document.getElementById("doc-body");
  const breadcrumbCategory = document.getElementById("breadcrumb-category");
  const breadcrumbTitle = document.getElementById("breadcrumb-title");
  const readingProgress = document.getElementById("reading-progress");
  const tocList = document.getElementById("toc-list");
  const regSelect = document.getElementById("reg-select");
  const regDetail = document.getElementById("reg-detail");
  const themeToggle = document.getElementById("theme-toggle");
  const searchModal = document.getElementById("search-modal");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const pdfModal = document.getElementById("pdf-modal");
  const toast = document.getElementById("app-toast");
  const sidebarFilter = document.getElementById("sidebar-filter");

  let currentDocId = "architecture";

  // Show Toast
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3200);
  }

  // Copy code directly from DOM (prevents any attribute escaping issues)
  window.appCopyCode = function (btn) {
    const wrapper = btn.closest(".code-wrapper");
    if (!wrapper) return;
    const code = wrapper.querySelector("code");
    if (!code) return;
    navigator.clipboard.writeText(code.innerText).then(() => {
      showToast("Copied code to clipboard!");
    }).catch(() => {
      showToast("Code copied!");
    });
  };

  // 2. Custom Markdown Parser (Hybrid: Marked.js when available + robust internal fallback)
  function renderMarkdown(md) {
    if (!md) return "";

    // 1. Normalize line endings (CRLF -> LF)
    let content = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // If marked is loaded from CDN, use marked.parse with our custom renderers
    if (window.marked && typeof window.marked.parse === "function") {
      try {
        // 1. Task list checkboxes
        content = content
          .replace(/\[x\]/gi, '<span class="checklist-badge checked">✓</span>')
          .replace(/\[ \]/gi, '<span class="checklist-badge">○</span>');

        // 2. Math blocks: $$...$$
        content = content.replace(/\$\$([\s\S]*?)\$\$/g, function (match, math) {
          if (window.katex && typeof window.katex.renderToString === "function") {
            try {
              return `<div class="math-block">${window.katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>\n\n`;
            } catch (e) {}
          }
          const clean = cleanMathFallback(math.trim());
          return `<div class="math-block"><code>${escapeHtml(clean)}</code></div>\n\n`;
        });

        // 3. Inline math: $...$
        content = content.replace(/\$([^\$\n]+)\$/g, function (match, math) {
          if (window.katex && typeof window.katex.renderToString === "function") {
            try {
              return window.katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
            } catch (e) {}
          }
          const clean = cleanMathFallback(math.trim());
          return `<code>${escapeHtml(clean)}</code>`;
        });

        // 4. GitHub-style callouts: > [!NOTE], etc.
        content = content.replace(/^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*\n([\s\S]*?)(?=\n\n|\n[#>-]|$)/gim, function (match, type, body) {
          const t = type.toLowerCase();
          const title = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
          let cleanBody = body.replace(/^>\s?/gm, "").trim();
          // Convert ### subheadings inside callouts to bold headers for clean card layout
          cleanBody = cleanBody.replace(/^###\s*(.*)$/gm, "**$1**\n");
          return `\n\n<div class="callout ${t}">\n\n<div class="callout-title">${title}</div>\n\n${cleanBody}\n\n</div>\n\n`;
        });

        const renderer = new window.marked.Renderer();

        // Custom code block renderer
        renderer.code = function ({ text, lang }) {
          const safeCode = escapeHtml(text || "");
          const displayLang = (lang || "code").toUpperCase();
          return `
            <div class="code-wrapper">
              <div class="code-header">
                <span class="code-lang-tag">${displayLang}</span>
                <button class="btn-copy-code" onclick="window.appCopyCode(this)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  Copy
                </button>
              </div>
              <pre><code class="language-${lang}">${safeCode}</code></pre>
            </div>
          `;
        };

        // Custom image renderer with responsive frame
        renderer.image = function ({ href, text, title }) {
          const safeAlt = escapeHtml(text || title || "");
          return `
            <figure class="doc-figure">
              <div class="doc-image-frame">
                <img src="${href}" alt="${safeAlt}" class="doc-image" onclick="window.open('${href}', '_blank')">
              </div>
              ${safeAlt ? `<figcaption class="doc-image-caption"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>${safeAlt}</figcaption>` : ""}
            </figure>
          `;
        };

        return window.marked.parse(content, { renderer, gfm: true, breaks: false });
      } catch (err) {
        console.warn("marked error, falling back to internal parser:", err);
      }
    }

    // Comprehensive offline / fallback parser
    return internalMarkdownParser(content);
  }

  function cleanMathFallback(expr) {
    if (!expr) return "";
    const supMap = {
      "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
      "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
      "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
      "n": "ⁿ", "i": "ⁱ"
    };

    let res = expr
      // Replace \text{...} with just inner text
      .replace(/\\text\{([^}]+)\}/g, "$1")
      // Replace superscripts ^{...} or ^d
      .replace(/\^{([0-9+\-=()ni]+)}/g, (m, digits) => {
        return digits.split("").map(c => supMap[c] || c).join("");
      })
      .replace(/\^([0-9+\-=()ni])/g, (m, c) => supMap[c] || c)
      // LaTeX spacing & common symbols
      .replace(/\\,/g, " ")
      .replace(/\\;/g, " ")
      .replace(/\\ /g, " ")
      .replace(/\\quad/g, "  ")
      .replace(/\\times/g, " × ")
      .replace(/\\cdot/g, " · ")
      .replace(/\\ll/g, " << ")
      .replace(/\\gg/g, " >> ")
      .replace(/\\to/g, " → ")
      .replace(/\\rightarrow/g, " → ")
      .replace(/\\le(q)?/g, " ≤ ")
      .replace(/\\ge(q)?/g, " ≥ ")
      .replace(/\\neq/g, " ≠ ")
      .replace(/\\approx/g, " ≈ ")
      .replace(/\\mid/g, " | ")
      .replace(/\\_/g, "_");

    return res.trim();
  }

  function internalMarkdownParser(md) {
    let tokens = {};
    let tokenIndex = 0;

    // 1. Stash Code blocks first (handles CRLF and LF cleanly)
    let text = md.replace(/```([a-zA-Z0-9_\-+]*)\r?\n([\s\S]*?)```/g, function (match, lang, code) {
      const key = `@@CODE_TOKEN_${tokenIndex++}@@`;
      const safeCode = escapeHtml(code.trim());
      const displayLang = (lang || "code").toUpperCase();
      tokens[key] = `
        <div class="code-wrapper">
          <div class="code-header">
            <span class="code-lang-tag">${displayLang}</span>
            <button class="btn-copy-code" onclick="window.appCopyCode(this)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy
            </button>
          </div>
          <pre><code class="language-${lang}">${safeCode}</code></pre>
        </div>
      `;
      return key;
    });

    // 2. Stash Math blocks ($$...$$ and $...$)
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, function (match, math) {
      const key = `@@MATH_TOKEN_${tokenIndex++}@@`;
      if (window.katex && typeof window.katex.renderToString === "function") {
        try {
          tokens[key] = `<div class="math-block">${window.katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
          return key;
        } catch (e) {}
      }
      const clean = cleanMathFallback(math.trim());
      tokens[key] = `<div class="math-block"><code>${escapeHtml(clean)}</code></div>`;
      return key;
    });

    text = text.replace(/\$([^\$\n]+)\$/g, function (match, math) {
      const key = `@@MATH_TOKEN_${tokenIndex++}@@`;
      if (window.katex && typeof window.katex.renderToString === "function") {
        try {
          tokens[key] = window.katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
          return key;
        } catch (e) {}
      }
      const clean = cleanMathFallback(math.trim());
      tokens[key] = `<code>${escapeHtml(clean)}</code>`;
      return key;
    });

    // 3. Stash Images
    text = text.replace(/!\[(.*?)\]\((.*?)\)/g, function (match, alt, src) {
      const key = `@@IMG_TOKEN_${tokenIndex++}@@`;
      tokens[key] = `
        <figure class="doc-figure">
          <div class="doc-image-frame">
            <img src="${src}" alt="${escapeHtml(alt)}" class="doc-image" onclick="window.open('${src}', '_blank')">
          </div>
          ${alt ? `<figcaption class="doc-image-caption"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>${escapeHtml(alt)}</figcaption>` : ""}
        </figure>
      `;
      return key;
    });

    // 4. Callout blocks
    text = text.replace(/^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*\n([\s\S]*?)(?=\n\n|$)/gim, function (match, type, content) {
      const t = type.toLowerCase();
      const title = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      const cleanedContent = parseInline(content.replace(/^>\s?/gm, "").trim());
      return `<div class="callout ${t}"><div class="callout-title">${title}</div><p>${cleanedContent}</p></div>`;
    });

    // 5. Tables
    text = text.replace(/\n(\|.+?\|\n\|[-:| ]+?\|\n(?:\|.+?\|\n?)+)/g, function (match, tableText) {
      const lines = tableText.trim().split("\n");
      if (lines.length < 3) return match;
      const headers = lines[0].split("|").map(s => s.trim()).filter(Boolean);
      const rows = lines.slice(2).map(line => line.split("|").map(s => s.trim()).filter(Boolean));

      let tableHtml = "<table><thead><tr>";
      headers.forEach(h => {
        tableHtml += `<th>${parseInline(h)}</th>`;
      });
      tableHtml += "</tr></thead><tbody>";
      rows.forEach(r => {
        tableHtml += "<tr>";
        r.forEach(cell => {
          tableHtml += `<td>${parseInline(cell)}</td>`;
        });
        tableHtml += "</tr>";
      });
      tableHtml += "</tbody></table>";
      return "\n" + tableHtml + "\n";
    });

    // 6. Headings (with parseInline!)
    text = text.replace(/^### (.*$)/gim, function (m, h) { return `<h3 id="${escapeHtml(h)}">${parseInline(h)}</h3>`; });
    text = text.replace(/^## (.*$)/gim, function (m, h) { return `<h2 id="${escapeHtml(h)}">${parseInline(h)}</h2>`; });
    text = text.replace(/^# (.*$)/gim, function (m, h) { return `<h1 id="${escapeHtml(h)}">${parseInline(h)}</h1>`; });

    // 7. Horizontal Rule
    text = text.replace(/^---$/gim, '<hr style="border:none;border-top:1px solid var(--border-light);margin:2rem 0;">');

    // 8. Ordered Lists (1. 2. 3.)
    text = text.replace(/((?:^[0-9]+\.\s+.*(?:\n|$))+)/gm, function (match, listBlock) {
      const items = listBlock.trim().split("\n").map(line => {
        const itemText = line.replace(/^[0-9]+\.\s+/, "");
        return `<li>${parseInline(itemText)}</li>`;
      });
      return `<ol>${items.join("")}</ol>\n\n`;
    });

    // 9. Unordered Lists (- or * or •)
    text = text.replace(/((?:^[ \t]*[-*•]\s+.*(?:\n|$))+)/gm, function (match, listBlock) {
      const items = listBlock.trim().split("\n").map(line => {
        const itemText = line.replace(/^[ \t]*[-*•]\s+/, "");
        return `<li>${parseInline(itemText)}</li>`;
      });
      return `<ul>${items.join("")}</ul>\n\n`;
    });

    // 10. Paragraphs
    let blocks = text.split(/\n{2,}/);
    let result = blocks.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<div") ||
        trimmed.startsWith("<table") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<figure") ||
        trimmed.startsWith("@@")
      ) {
        return trimmed;
      }
      return `<p>${parseInline(trimmed)}</p>`;
    }).join("\n\n");

    // 11. Restore all tokens
    Object.keys(tokens).forEach(key => {
      result = result.split(key).join(tokens[key]);
    });

    return result;
  }

  function parseInline(text) {
    if (!text) return "";
    return text
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[x\]/gi, '<span class="checklist-badge checked">✓</span>')
      .replace(/\[ \]/gi, '<span class="checklist-badge">○</span>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-terracotta);font-weight:600;">$1</a>');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  window.appShowToast = showToast;

  // 3. Render Navigation
  function renderSidebar(filterText = "") {
    if (!navContainer) return;
    navContainer.innerHTML = "";

    const categories = {};
    docs.forEach(doc => {
      const cat = doc.category || "General";
      if (!categories[cat]) categories[cat] = [];
      if (!filterText || doc.title.toLowerCase().includes(filterText.toLowerCase()) || doc.description.toLowerCase().includes(filterText.toLowerCase())) {
        categories[cat].push(doc);
      }
    });

    Object.keys(categories).forEach(cat => {
      const items = categories[cat];
      if (items.length === 0) return;

      const catDiv = document.createElement("div");
      catDiv.className = "nav-category";
      catDiv.innerHTML = `<div class="category-heading">${cat} (${items.length})</div>`;

      const ul = document.createElement("ul");
      ul.className = "nav-list";

      items.forEach(doc => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${doc.id}`;
        a.className = `nav-item-link ${doc.id === currentDocId ? 'active' : ''}`;
        a.innerHTML = `
          <span>${doc.title}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        `;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          window.location.hash = doc.id;
        });
        li.appendChild(a);
        ul.appendChild(li);
      });

      catDiv.appendChild(ul);
      navContainer.appendChild(catDiv);
    });
  }

  // 4. Render Active Article
  function loadDoc(docId) {
    if (docId === "sv39-mmu") docId = "module-2-sv39-mmu";
    const doc = docs.find(d => d.id === docId) || docs[0];
    if (!doc) return;

    currentDocId = doc.id;
    window.location.hash = doc.id;

    if (breadcrumbCategory) breadcrumbCategory.textContent = doc.category || "Docs";
    if (breadcrumbTitle) breadcrumbTitle.textContent = doc.title;
    document.title = `${doc.title} · RV64 Yantra Docs`;

    // Render HTML
    if (articleContainer) {
      articleContainer.innerHTML = renderMarkdown(doc.content);

      // Sanitize heading IDs for TOC
      const headings = articleContainer.querySelectorAll("h1, h2, h3");
      headings.forEach((h, idx) => {
        const id = h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        h.id = id || `section-${idx}`;
      });

      // Append Next / Prev Navigation
      renderFooterNav(doc);
    }

    renderTOC();
    renderSidebar(sidebarFilter ? sidebarFilter.value : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderFooterNav(currentDoc) {
    const currentIndex = docs.findIndex(d => d.id === currentDoc.id);
    const prevDoc = currentIndex > 0 ? docs[currentIndex - 1] : null;
    const nextDoc = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;

    const navDiv = document.createElement("div");
    navDiv.className = "doc-footer-nav";

    let html = "";
    if (prevDoc) {
      html += `
        <a href="#${prevDoc.id}" class="footer-nav-card" style="text-align:left;">
          <div class="nav-direction">← Previous Page</div>
          <div class="nav-doc-title">${prevDoc.title}</div>
        </a>
      `;
    } else {
      html += `<div></div>`;
    }

    if (nextDoc) {
      html += `
        <a href="#${nextDoc.id}" class="footer-nav-card" style="text-align:right;">
          <div class="nav-direction">Next Page →</div>
          <div class="nav-doc-title">${nextDoc.title}</div>
        </a>
      `;
    }

    navDiv.innerHTML = html;
    articleContainer.appendChild(navDiv);
  }

  // 5. Table of Contents & Scrollspy
  function renderTOC() {
    if (!tocList || !articleContainer) return;
    tocList.innerHTML = "";

    const headings = articleContainer.querySelectorAll("h2, h3");
    if (headings.length === 0) {
      tocList.innerHTML = '<li style="font-size:0.8rem;color:var(--text-muted);">No subheadings</li>';
      return;
    }

    headings.forEach(h => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.className = "toc-link";
      a.textContent = h.textContent;
      if (h.tagName === "H3") {
        a.style.paddingLeft = "1.2rem";
        a.style.fontSize = "0.78rem";
      }
      a.addEventListener("click", (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: "smooth" });
      });
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }

  // 6. RV64 Register Inspector Controller
  function initRegisterInspector() {
    if (!regSelect || !regDetail) return;
    regSelect.innerHTML = "";

    RV64_REGISTERS.forEach(reg => {
      const opt = document.createElement("option");
      opt.value = reg.num;
      opt.textContent = reg.num === 32 ? "pc (Program Counter)" : `x${reg.num} (${reg.name})`;
      regSelect.appendChild(opt);
    });

    function updateRegCard(num) {
      const reg = RV64_REGISTERS.find(r => r.num === parseInt(num, 10)) || RV64_REGISTERS[0];
      regDetail.innerHTML = `
        <div><strong>Name:</strong> ${reg.name}</div>
        <div><strong>ABI Saver:</strong> ${reg.saver}</div>
        <div><strong>Role:</strong> ${reg.desc}</div>
      `;
    }

    regSelect.addEventListener("change", (e) => updateRegCard(e.target.value));
    updateRegCard(0);
  }

  // 7. Reading Progress Tracker
  window.addEventListener("scroll", () => {
    if (!readingProgress) return;
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
    readingProgress.style.width = `${Math.min(progress, 100)}%`;
  });

  // 8. Search Modal Controller
  function openSearch() {
    if (!searchModal) return;
    searchModal.classList.add("open");
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
      renderSearchResults("");
    }
  }

  function closeSearch() {
    if (!searchModal) return;
    searchModal.classList.remove("open");
  }

  function renderSearchResults(query) {
    if (!searchResults) return;
    searchResults.innerHTML = "";

    const q = query.trim().toLowerCase();
    const matches = docs.filter(d => 
      !q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      searchResults.innerHTML = `<li style="padding:1rem;color:var(--text-muted);text-align:center;">No matching documentation found</li>`;
      return;
    }

    matches.slice(0, 8).forEach((doc, idx) => {
      const li = document.createElement("li");
      li.className = `search-result-item ${idx === 0 ? 'selected' : ''}`;
      li.innerHTML = `
        <div class="result-title">${doc.title} <span style="font-size:0.75rem;font-weight:normal;color:var(--text-muted);">(${doc.category})</span></div>
        <div class="result-desc">${doc.description}</div>
      `;
      li.addEventListener("click", () => {
        closeSearch();
        loadDoc(doc.id);
      });
      searchResults.appendChild(li);
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => renderSearchResults(e.target.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSearch();
      if (e.key === "Enter") {
        const first = searchResults.querySelector(".search-result-item");
        if (first) first.click();
      }
    });
  }

  // Shortcut Ctrl+K / Cmd+K
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openSearch();
    }
    if (e.key === "Escape") {
      closeSearch();
      closePdfModal();
    }
  });

  // 9. PDF Drag & Drop In-Browser Extractor
  function openPdfModal() {
    if (pdfModal) pdfModal.classList.add("open");
  }

  function closePdfModal() {
    if (pdfModal) pdfModal.classList.remove("open");
  }

  const dropzone = document.getElementById("pdf-dropzone");
  const fileInput = document.getElementById("pdf-file-input");
  const pdfTitleInput = document.getElementById("pdf-doc-title");
  const pdfCategoryInput = document.getElementById("pdf-doc-category");
  const pdfPreview = document.getElementById("pdf-extracted-preview");
  const btnSaveDoc = document.getElementById("btn-save-pdf-doc");
  const btnDownloadMd = document.getElementById("btn-download-md");

  let extractedMarkdown = "";

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) {
        handlePdfFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handlePdfFile(e.target.files[0]);
      }
    });
  }

  // Pure client-side PDF text extraction using PDF.js
  async function handlePdfFile(file) {
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a valid PDF document.");
      return;
    }

    const defaultTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    if (pdfTitleInput) pdfTitleInput.value = defaultTitle.charAt(0).toUpperCase() + defaultTitle.slice(1);

    dropzone.innerHTML = `
      <div class="dropzone-text">Reading & Parsing '${file.name}'...</div>
      <div class="dropzone-subtext">Extracting technical sections and code...</div>
    `;

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Ensure pdfjsLib is loaded
      if (window.pdfjsLib) {
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = `# ${pdfTitleInput.value}\n\n`;
        fullText += `> Imported from PDF: \`${file.name}\` (${pdf.numPages} pages)\n\n`;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items.map(item => item.str).join(" ");
          if (pageStrings.trim()) {
            fullText += `## Section ${i}\n\n${pageStrings.trim()}\n\n`;
          }
        }

        extractedMarkdown = fullText;
        if (pdfPreview) pdfPreview.value = extractedMarkdown;
        dropzone.innerHTML = `
          <div class="dropzone-text" style="color:var(--accent-terracotta);">✓ Successfully Extracted ${pdf.numPages} Pages</div>
          <div class="dropzone-subtext">Review the markdown preview below and save.</div>
        `;
      } else {
        // Fallback text generator
        extractedMarkdown = `# ${pdfTitleInput.value}\n\n> Imported from \`${file.name}\`\n\nContent ready for review.`;
        if (pdfPreview) pdfPreview.value = extractedMarkdown;
      }
    } catch (err) {
      console.error(err);
      alert("Could not parse PDF text: " + err.message);
    }
  }

  if (btnSaveDoc) {
    btnSaveDoc.addEventListener("click", () => {
      const title = (pdfTitleInput ? pdfTitleInput.value : "").trim() || "Imported PDF Doc";
      const category = (pdfCategoryInput ? pdfCategoryInput.value : "").trim() || "Imported Specifications";
      const content = pdfPreview ? pdfPreview.value : extractedMarkdown;
      const id = "doc-" + Date.now();

      const newDoc = {
        id,
        title,
        category,
        description: `Imported document: ${title}`,
        content
      };

      docs.push(newDoc);

      // Persist in localStorage
      try {
        const custom = JSON.parse(localStorage.getItem("rv64_custom_docs") || "[]");
        custom.push(newDoc);
        localStorage.setItem("rv64_custom_docs", JSON.stringify(custom));
      } catch (e) {
        console.warn(e);
      }

      closePdfModal();
      loadDoc(id);
      showToast(`✓ Document added! To push to Git & Vercel, run: npm run deploy`);
    });
  }

  if (btnDownloadMd) {
    btnDownloadMd.addEventListener("click", () => {
      const content = pdfPreview ? pdfPreview.value : extractedMarkdown;
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(pdfTitleInput ? pdfTitleInput.value : 'document').toLowerCase().replace(/\s+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // 10. Theme Toggle Controller
  function initTheme() {
    const savedTheme = localStorage.getItem("rv64_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme");
        const next = cur === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("rv64_theme", next);
      });
    }
  }

  // 11. Initial Startup
  function init() {
    initTheme();
    initRegisterInspector();

    // Hash navigation listener
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && hash !== currentDocId) {
        loadDoc(hash);
      }
    });

    if (sidebarFilter) {
      sidebarFilter.addEventListener("input", (e) => renderSidebar(e.target.value));
    }

    // Attach Header search trigger
    const searchBtn = document.getElementById("btn-open-search");
    if (searchBtn) searchBtn.addEventListener("click", openSearch);

    const pdfBtn = document.getElementById("btn-open-pdf");
    if (pdfBtn) pdfBtn.addEventListener("click", openPdfModal);

    const closePdfBtn = document.getElementById("btn-close-pdf");
    if (closePdfBtn) closePdfBtn.addEventListener("click", closePdfModal);

    const closeSearchBtn = document.getElementById("btn-close-search");
    if (closeSearchBtn) closeSearchBtn.addEventListener("click", closeSearch);

    // Initial doc load
    const initialHash = window.location.hash.replace("#", "") || "architecture";
    loadDoc(initialHash);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
