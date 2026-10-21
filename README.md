# Yantra RV64 Documentation Website

A high-performance technical documentation website for the **Yantra RISC-V 64-bit Emulator** project, styled in a warm **beige, cream, and skin** color palette with a pure frontend architecture (zero backend, zero environment variables).

---

## 🎨 Color Palette & Aesthetic

- **Cream**: `#FDFCF7`, `#FAF5EB`, `#F4ECE1` (Parchment surfaces)
- **Beige**: `#F2EAE0`, `#EEDECF`, `#DEC4AD` (Subtle cards & borders)
- **Skin & Earth Tones**: `#CCA88B`, `#B88B6E`, `#885A3F`, `#4B2F1F` (Accents, badges, and deep espresso inks)
- **Terracotta Warm Accent**: `#B9663E` (Interactive elements and active link indicators)

---

## ⚡ Zero-Backend Architecture (Painless Vercel Deployment)

- **No Database**: No Prisma, PostgreSQL, Docker, or SQLite required.
- **No Environment Variables**: No `.env`, secret keys, or API tokens needed on Vercel.
- **Instant Deployment**: Vercel detects standard static HTML/CSS/JS with `vercel.json` and builds in under 15 seconds.

---

## 📄 How to Upload Content as You Give the PDF

### Option A: In-Browser Drag & Drop (Instant)
1. Open the documentation website in your browser.
2. Click the **"Import PDF"** button in the top navigation bar.
3. Drag and drop your PDF file.
4. The client-side PDF engine parses the document, headings, and code.
5. Click **"Save & Add to Website"** or **"Download .md"**.

### Option B: Automatic Python Ingestion with Git Auto-Push
Drop your PDF into the `input_pdfs/` folder or run:

```bash
# Ingest PDF and automatically commit & push to GitHub
python scripts/import_pdf.py "path/to/your-specification.pdf"
```

The script will:
1. Extract text and code using `pypdf`.
2. Format into clean markdown.
3. Update `js/docs-data.js` and `docs/`.
4. Automatically run `git push origin main` so **Vercel** immediately triggers an automatic redeployment!

---

## 🚀 One-Command Git Push for Vercel

Whenever you want to push updates:

```powershell
npm run deploy
```

Or directly via PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_and_push.ps1 "docs: your custom update note"
```

---

## 💻 Local Preview

Run any local static server or simply open `index.html` in your browser:

```bash
npm start
```
Or with Python:
```bash
python -m http.server 3000
```
Then navigate to: `http://localhost:3000`
