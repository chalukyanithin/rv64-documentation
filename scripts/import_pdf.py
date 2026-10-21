#!/usr/bin/env python3
"""
RV64 Documentation PDF Importer
Extracts text, chapters, and sections from a PDF file, formats them into markdown,
and updates the documentation website data with automatic git deployment support.
"""

import os
import sys
import re
import json
import subprocess
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Error: pypdf is required. Install it using: pip install pypdf")
    sys.exit(1)


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text).strip('-')
    return text or 'untitled-doc'


def clean_pdf_text(text: str) -> str:
    # Remove excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Fix hyphenated line breaks
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    # Normalize bullet characters
    text = re.sub(r'^[•●*]\s*', '- ', text, flags=re.MULTILINE)
    return text.strip()


def extract_pdf_content(pdf_path: str):
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    print(f"Reading PDF: {pdf_path} ({total_pages} pages)")

    full_text = []
    for idx, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        page_text = clean_pdf_text(page_text)
        if page_text:
            full_text.append(f"<!-- Page {idx + 1} -->\n" + page_text)

    joined = "\n\n".join(full_text)
    return joined, total_pages


def format_markdown_from_text(raw_text: str, title: str) -> str:
    lines = raw_text.splitlines()
    md_lines = [f"# {title}", ""]
    
    in_code_block = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            md_lines.append("")
            continue
            
        # Detect assembly/code blocks (e.g. lines with registers or C++ code)
        is_asm = re.match(r'^(addi|add|sub|mul|div|lw|sw|ld|sd|jal|jalr|beq|bne|blt|bge|csrr|csrw|ecall|ebreak|mret|sret)\s+', stripped, re.IGNORECASE)
        is_cpp = re.match(r'^(#include|namespace|class|struct|uint64_t|int|void|template)\b', stripped)
        
        if (is_asm or is_cpp) and not in_code_block:
            lang = "assembly" if is_asm else "cpp"
            md_lines.append(f"```{lang}")
            in_code_block = True
            
        if in_code_block and not (is_asm or is_cpp or stripped.startswith("//") or stripped.startswith(";")):
            if not stripped.endswith(";") and not stripped.endswith("}"):
                md_lines.append("```")
                in_code_block = False

        # Detect potential headings (short uppercase or numbered lines)
        heading_match = re.match(r'^([0-9]+(\.[0-9]+)*)\s+([A-Z][A-Za-z0-9\s:_-]{3,60})$', stripped)
        if heading_match:
            dots = heading_match.group(1).count('.')
            prefix = "#" * min(dots + 2, 4)
            md_lines.append(f"\n{prefix} {heading_match.group(3)}\n")
            continue

        if stripped.isupper() and len(stripped) < 50 and not stripped.startswith("PAGE"):
            md_lines.append(f"\n## {stripped.title()}\n")
            continue

        md_lines.append(line)

    if in_code_block:
        md_lines.append("```")

    return "\n".join(md_lines)


def update_docs_data(slug: str, title: str, category: str, description: str, markdown_content: str):
    workspace_root = Path(__file__).resolve().parent.parent
    docs_data_path = workspace_root / "js" / "docs-data.js"
    docs_dir = workspace_root / "docs"
    docs_dir.mkdir(exist_ok=True)

    # Save individual markdown file as well
    md_file = docs_dir / f"{slug}.md"
    md_file.write_text(markdown_content, encoding="utf-8")
    print(f"✓ Saved markdown to {md_file}")

    if not docs_data_path.exists():
        print(f"Warning: {docs_data_path} not found.")
        return

    content = docs_data_path.read_text(encoding="utf-8")
    
    # Check if entry already exists
    new_entry = {
        "id": slug,
        "title": title,
        "category": category,
        "description": description,
        "content": markdown_content
    }

    # We will inject into window.DOCS_DATABASE or exports
    json_repr = json.dumps(new_entry, indent=2)

    # If already present, replace; else append before the closing array bracket
    if f'"id": "{slug}"' in content or f"'id': '{slug}'" in content:
        print(f"Updating existing entry for {slug} in docs-data.js")
        pattern = rf'\{{\s*["\']id["\']:\s*["\']{slug}["\'].*?\n\s*\}}(?=,\n|\n\])'
        content = re.sub(pattern, json_repr, content, flags=re.DOTALL)
    else:
        print(f"Appending new entry for {slug} to docs-data.js")
        # Find the last bracket
        idx = content.rfind("];")
        if idx != -1:
            comma = ",\n" if content[:idx].strip().endswith("}") else ""
            content = content[:idx].rstrip() + comma + "  " + json_repr.replace("\n", "\n  ") + "\n];\n" + content[idx+2:]

    docs_data_path.write_text(content, encoding="utf-8")
    print(f"✓ Updated {docs_data_path}")


def main():
    workspace_root = Path(__file__).resolve().parent.parent
    input_dir = workspace_root / "input_pdfs"
    input_dir.mkdir(exist_ok=True)

    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        # Check input_pdfs folder
        pdfs = list(input_dir.glob("*.pdf"))
        if not pdfs:
            print("No PDF file specified.")
            print(f"Usage: python scripts/import_pdf.py <path_to_pdf>")
            print(f"Or drop PDF files into: {input_dir}")
            return
        pdf_path = str(pdfs[0])
        print(f"Found PDF in input folder: {pdf_path}")

    pdf_file = Path(pdf_path)
    if not pdf_file.exists():
        print(f"Error: File not found: {pdf_path}")
        return

    doc_title = pdf_file.stem.replace("-", " ").replace("_", " ").title()
    doc_slug = slugify(pdf_file.stem)

    print(f"\nProcessing '{pdf_file.name}'...")
    raw_text, pages = extract_pdf_content(str(pdf_file))
    print(f"Extracted {len(raw_text)} characters across {pages} pages.")

    markdown = format_markdown_from_text(raw_text, doc_title)
    description = f"Imported from {pdf_file.name} ({pages} pages)."

    update_docs_data(doc_slug, doc_title, "Imported Specifications", description, markdown)

    print("\n------------------------------------------------------------")
    print(f"✓ PDF successfully imported into documentation: '{doc_title}'")
    print("------------------------------------------------------------")

    # Ask or automatically push
    auto_push = os.environ.get("AUTO_PUSH", "1")
    if auto_push == "1":
        print("\nTriggering auto-push to git...")
        ps_script = workspace_root / "scripts" / "sync_and_push.ps1"
        if ps_script.exists():
            subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", str(ps_script), f"docs: import {doc_title} from PDF"])


if __name__ == "__main__":
    main()
