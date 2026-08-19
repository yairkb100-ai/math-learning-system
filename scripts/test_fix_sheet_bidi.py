# -*- coding: utf-8 -*-
"""Guards for the in-place sheet repair: it must fix prose and touch nothing else.

    py scripts/test_fix_sheet_bidi.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fix_sheet_bidi import repair_html  # noqa: E402

failures = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"\n          {detail}" if not ok else ""))
    if not ok:
        failures.append(name)


def same(name, html):
    out, n = repair_html(html)
    check(name, out == html and n == 0, f"{n} node(s) changed -> {out[:180]}")


# --- prose is repaired --------------------------------------------------------
out, n = repair_html("<li>כי 6 × 4 = 24 ונשארה 1</li>")
check("bare math in prose is isolated", '<span class="eq">' in out and n == 1, out)

out, _ = repair_html("<li>פתרו $x^{2} = 49$ ומצאו</li>")
check("a literal $ is rendered away", "$" not in out and "49" in out, out)

# An escaped comparison operator must not hide the expression from the matcher,
# and the escaping has to survive the round trip.
out, n = repair_html("<li>הסדר הנכון: 11&lt;12 ולכן</li>")
check("an escaped operator is seen through",
      '<span class="eq">' in out and "11&lt;12" in out and "<12" not in out.replace("&lt;12", ""),
      out)
out, _ = repair_html("<li>א. 0.08 &nbsp; ב. 6 × 4 = 24</li>")
check("&nbsp; survives a repaired node", "&nbsp;" in out and 'class="eq"' in out, out)

# A raw "<" in the shipped HTML is a bogus tag the browser swallows — the text
# after it is invisible today. It must be recovered, escaped and isolated.
out, _ = repair_html("<li>קטן מחצי (חצי מ-24=12, ו‑11<12). ב. המשך</li>")
check("an unescaped '<' is recovered, not treated as a tag",
      "ב. המשך" in out and "11&lt;12" in out and "<12)" not in out, out)

# --- everything else is left exactly as it was --------------------------------
same("an <svg> body is untouched",
     '<div><svg width="168.3" viewBox="0 0 168.3 210.0">'
     '<polygon points="116.6,30.0 30.0,180.0" fill="#8ecae6"/></svg></div>')
same("a <style> body is untouched",
     '<style>.eq { direction: ltr; margin: 0 3px; } h1 { font-size: 24px; }</style>')
same("a <script> body is untouched",
     '<script>var d=[{"a":0,"o":["1 + 1 = 2"]}];x=1+2;</script>')
same("tag attributes are untouched",
     '<div style="text-align:center;margin:10px 0" data-n="3 + 4"><b>שלום</b></div>')
same("math already inside an .eq span is not re-wrapped",
     '<li>ההפרש <span class="eq">7 + 2 = 9</span> ולכן</li>')
same("a stacked fraction span is not re-wrapped",
     '<li>קטן מחצי: <span class="fr"><b>4</b><i>9</i></span> בדיוק</li>')
same("a braced system's equations are not re-wrapped",
     '<span class="sys"><span class="sysbrace">{</span><span class="syseq">'
     '<span>x + y = 10</span><span>y=17</span></span></span>')
same("plain Hebrew with counting numbers is untouched",
     '<li>4 בלוקים ליד 3 קופסאות, שאלה 5</li>')
same("an inline tag inside prose survives",
     '<li>איזה שבר נמצא צעד אחד <b>לפני</b> 1?</li>')

# --- idempotence --------------------------------------------------------------
src = "<li>כי 6 × 4 = 24, ואחר כך 9 = 4.5 בדיוק</li>"
once, _ = repair_html(src)
twice, n2 = repair_html(once)
check("repair is idempotent", twice == once and n2 == 0, f"{n2} node(s) on the second pass")

# Idempotence has to hold on a whole realistic document too, not just one node:
# a stateful span tracker passes the single-node case and still drifts here.
DOC = (
    '<html><head><style>.eq { direction: ltr; }</style></head><body>'
    '<div class="sheet"><h2 class="q">שאלה 1</h2>'
    '<li>פתרו את המערכת: <span class="sys"><span class="sysbrace">{</span>'
    '<span class="syseq"><span>x + y = 10</span><span>y=17</span></span></span> ואז</li>'
    '<li>הציבו x + b וקבלו 6 × 4 = 24 בדיוק</li>'
    '<li><span class="fr"><b>4</b><i>9</i></span> קטן מחצי (חצי מ-9 = 4.5)</li>'
    '<div><svg viewBox="0 0 10 10"><polygon points="1,2 3,4"/></svg></div>'
    '<script>x=[1,2].map(i=>`${i} + 1`);</script></div></body></html>')
p1, c1 = repair_html(DOC)
p2, c2 = repair_html(p1)
check("whole-document repair is idempotent", p2 == p1 and c2 == 0,
      f"pass1 changed {c1}, pass2 changed {c2}")
check("whole-document repair still fixed the prose", c1 >= 2, f"only {c1} node(s)")
check("whole-document repair left the system alone",
      '<span class="syseq"><span>x + y = 10</span><span>y=17</span></span>' in p1)
check("whole-document repair left the svg and script alone",
      '<polygon points="1,2 3,4"/>' in p1 and '`${i} + 1`' in p1)

# --- the fraction span nested inside prose keeps its siblings repaired --------
out, _ = repair_html('<li>קטן מחצי: <span class="fr"><b>4</b><i>9</i></span> (חצי מ-9 = 4.5)</li>')
check("prose after a .fr span is still repaired",
      '<span class="fr"><b>4</b><i>9</i></span>' in out and out.count('class="eq"') == 1, out)

print("\n" + ("ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}"))
sys.exit(1 if failures else 0)
