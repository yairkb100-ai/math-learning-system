---
name: course-writer
description: Generate complete, structured math learning courses (לומדות מתמטיקה) in Hebrew or English. Use when the user asks to "write/create a course", "כתוב קורס", "בנה לומדה", "/course-writer", or wants structured chapters with content, examples, exercises, and quizzes on a math topic. Outputs a validated JSON course and an optional Markdown version.
---

# Course Writer — מכתבת לומדות מתמטיקה

Generate a complete, pedagogically-structured course on a mathematics topic. The
output is a single JSON object that validates against `reference/course-schema.json`,
plus (on request) a readable Markdown rendering.

## When to use

Trigger on requests like:
- "כתוב קורס על משוואות ריבועיות לכיתה י'"
- "בנה לומדה על שברים ל-6 פרקים"
- "Create a course on quadratic equations, Intermediate, 5 chapters"
- `/course-writer <topic>`

## Inputs (collect these first)

| Param | Required | Default | Values |
|-------|----------|---------|--------|
| `topic` | ✅ yes | — | specific topic, e.g. "משוואות ריבועיות" (avoid vague like "מתמטיקה") |
| `level` | no | `Intermediate` | `Beginner` / `Intermediate` / `Advanced` |
| `chapters` | no | `5` | integer 3–10 |
| `language` | no | `Hebrew` | `Hebrew` / `English` |
| `include` | no | `[]` | any of: `diagrams`, `code-examples`, `case-studies`, `resources` |

If `topic` is missing, ask exactly one clarifying question, then proceed.
For every other missing param, silently apply the default — do not interrogate the user.

## Procedure

1. **Read the schema.** Open `reference/course-schema.json` so the output shape is exact.
2. **Design the outline.** Produce `chapters` chapter titles that build on each other
   (concept → method → application). Match difficulty to `level`.
3. **Write each chapter** with:
   - `content`: 2000–2500 words of clear explanation **in the requested language**.
     Use LaTeX-style inline math (`$ax^2+bx+c=0$`) so it renders anywhere.
   - `examples`: 2–4 worked examples. If `code-examples` requested, add a Python
     (`numpy`/`matplotlib`) snippet per chapter. If `diagrams` requested, describe the
     figure in an `example` of `type: "diagram"` with a text description of what to plot.
   - `exercises`: 3–5 practice problems with `difficulty` (`easy`/`medium`/`hard`)
     graded to `level`. Include the answer in `solution`.
   - `quiz`: exactly 5 questions, mostly `multiple-choice`, with `correct_answer`.
4. **Verify the math.** Re-derive every worked answer, every exercise solution, and every
   quiz answer before emitting. Do not ship an equation you have not checked. This is the
   single most important step — a wrong root or discriminant makes the whole course useless.
5. **Emit JSON** that validates against the schema. Fill `metadata` (compute real
   `word_count`, estimate `estimated_hours` ≈ chapters × 1).
6. **Save** to `courses/<slug>.json` in the project root (slug = kebab-case of topic).
   If `include` has `resources`, add real, well-known references (Khan Academy, etc.).
7. **Markdown (on request).** If the user wants a readable copy, also render
   `courses/<slug>.md` — run `python reference/json_to_md.py courses/<slug>.json`.

## Quality checklist (self-check before finishing)

- [ ] Exactly `chapters` chapters, each with content in the correct language.
- [ ] Every worked example, exercise, and quiz answer re-verified.
- [ ] 3–5 exercises + exactly 5 quiz questions per chapter.
- [ ] Diagrams / code examples present **iff** requested in `include`.
- [ ] JSON validates against `reference/course-schema.json`.
- [ ] `metadata.word_count` reflects the actual content.

## References

- `reference/course-schema.json` — authoritative output shape.
- `reference/example-course.json` — a minimal 1-chapter reference output.
- `reference/json_to_md.py` — converts a course JSON to readable Markdown.
