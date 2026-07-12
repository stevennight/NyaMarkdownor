# Project Rules

## Source Of Truth

- Markdown source is the canonical document representation.
- Preview and WYSIWYG modes are projections of that source. Their parse and serialize paths must preserve Markdown semantics.
- Do not persist editor-library implementation details in Markdown, draft, snapshot, clipboard, or disk formats.
- A line break inside a pipe-table cell is represented as `<br>`. A physical newline ends the Markdown table row.
- `U+001F` is a legacy Tiptap table-cell block separator, not a Markdown line-break format. Only markerless legacy recovery records may migrate it, and only in recognized table cells outside literal code.

## File And Recovery Behavior

- Preserve externally supplied Markdown source. Generic file reads and saves must not silently migrate source text.
- Normalize editor line endings to LF internally and restore the document's selected line-ending style only when writing to disk.
- Recovery records must carry explicit format markers when compatibility behavior depends on their serialization format.
- Never overwrite unsaved editor content after an external disk change without the user's confirmation. Keep a compare entry available.

## Implementation

- Prefer existing parsers and structured helpers over ad hoc Markdown string handling.
- Keep table-specific behavior scoped to table cells; ordinary HTML, inline code, escaped text, and code blocks must retain their original meaning.
- Add focused regression tests for parse, edit, serialize, restart recovery, preview, and clipboard behavior when changing Markdown conversions.
- Do not edit generated output in `dist`, `node_modules`, or `src-tauri/target`.

## Verification

- Run `npm test`.
- Run `npm run check`.
- Run `npm run build` for changes that affect production behavior.
- Do not create tags or push commits unless the user explicitly requests it.
