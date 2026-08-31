# -*- coding: utf-8 -*-
"""Three-page RTL practice pack for the grade-7 geometry course."""
from pathlib import Path
import re
from shutil import copyfile
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "דף-תרגול-גאומטריה-כיתה-ז.pdf"
ASSET_OUT = ROOT / "courses" / "assets" / "geometry-angles-proofs" / "דף-תרגול-מסכם-5-עמודים.pdf"

def rtl(text):
    values = []
    def keep(m):
        marker = f"@@{len(values)}@@"; values.append(m.group(0)); return marker
    text = re.sub(r"[0-9°.,()]+", keep, text)[::-1]
    for i, value in enumerate(values): text = text.replace(f"@@{i}@@", value)
    return text

def header(c, title, subtitle, page):
    w, h = A4; c.setFillColor(HexColor("#173F36")); c.rect(0, h-100, w, 100, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("Arial", 21); c.drawRightString(555, h-42, rtl(title))
    c.setFont("Arial", 10); c.drawRightString(555, h-66, rtl(subtitle))
    c.setFillColor(HexColor("#1D3B34")); c.drawRightString(555, h-125, rtl(f"דף {page} מתוך 5 | שם: ____________________"))

def question(c, y, number, text, lines=1):
    c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial", 11); c.drawRightString(555, y, rtl(f"{number}. {text}"))
    c.setStrokeColor(HexColor("#B8C8C2"))
    for n in range(lines): c.line(55, y-20-n*18, 555, y-20-n*18)
    return y - 31 - 18*lines


def draw_isosceles_apex_angle(c):
    """Draw the 40-degree apex angle inside an explicitly isosceles triangle."""
    apex_x, apex_y = 275, 455
    left_x, right_x, base_y = 220, 330, 375

    c.setStrokeColor(HexColor("#1F7A8C"))
    c.setLineWidth(2)
    c.line(left_x, base_y, right_x, base_y)
    c.line(left_x, base_y, apex_x, apex_y)
    c.line(apex_x, apex_y, right_x, base_y)

    # Equal-side tick marks make the isosceles condition explicit.
    c.setStrokeColor(HexColor("#2F9E6A"))
    c.setLineWidth(1.5)
    c.line(243.4, 417.8, 251.6, 412.2)
    c.line(298.4, 412.2, 306.6, 417.8)

    # Mark the angle between the two rays, inside the triangle.
    c.setStrokeColor(HexColor("#F2B134"))
    c.setLineWidth(2)
    c.arc(apex_x - 22, apex_y - 22, apex_x + 22, apex_y + 22, 235.5, 69)
    c.setFillColor(HexColor("#1D3B34"))
    c.setFont("Arial", 10)
    c.drawCentredString(apex_x, 414, "40°")

def first(c):
    header(c, "דף תרגול — גאומטריה לכיתה ז׳", "זוויות על ישר, זוויות קודקודיות וישרים מקבילים", 1)
    c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial", 15); c.drawRightString(555, 690, rtl("א. מסתכלים, מסמנים, מחשבים"))
    y = question(c, 658, 1, "זווית צמודה לזווית בת 73° נמצאת על ישר. חשבו את מידתה.")
    y = question(c, y, 2, "שתי זוויות קודקודיות. אחת מהן 118°. מצאו את הזווית שמולה ונמקו.")
    question(c, y, 3, "שני ישרים מקבילים נחתכים בישר שלישי. זווית מתאימה היא 64°. מצאו זווית מתחלפת.")
    c.setStrokeColor(HexColor("#1F7A8C")); c.setLineWidth(2); c.line(205,330,385,330); c.line(205,265,385,265)
    c.setStrokeColor(HexColor("#F2B134")); c.line(260,355,315,240); c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial",10); c.drawCentredString(290,344,"64°")
    c.drawRightString(555,225,rtl("בשרטוט הקטן: סמנו זוג זוויות מתאימות וזוג זוויות קודקודיות."))
    c.setFillColor(HexColor("#F2B134")); c.roundRect(55,72,500,58,8,fill=1,stroke=0); c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial",10)
    c.drawRightString(545,104,rtl("טיפ: כתבו גם את הנימוק: צמודות על ישר, קודקודיות, מתאימות או מתחלפות.")); c.drawRightString(545,84,rtl("בדיקה: זוויות צמודות משלימות ל־180°; זוויות קודקודיות שוות.")); c.showPage()

def second(c):
    header(c, "משולשים ומרובעים", "סכום זוויות, זוויות בסיס ומקבילית", 2)
    c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial",15); c.drawRightString(555,690,rtl("ב. משולשים"))
    y = question(c,658,4,"במשולש נתונות זוויות 52° ו־71°. חשבו את הזווית השלישית והראו חישוב.")
    question(c,y,5,"במשולש שווה־שוקיים זווית הראש היא 40°. חשבו כל זווית בסיס.")
    draw_isosceles_apex_angle(c)
    c.drawRightString(555,345,rtl("בשרטוט הקטן: הסבירו מדוע שתי זוויות הבסיס שוות.")); c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial",15); c.drawRightString(555,300,rtl("ג. מרובעים"))
    y = question(c,270,6,"במרובע שלוש זוויות: 90°, 110°, 75°. חשבו את הרביעית.")
    question(c,y,7,"במקבילית זווית אחת היא 112°. חשבו זווית סמוכה וזווית נגדית.",2)
    c.setStrokeColor(HexColor("#2F9E6A")); c.setLineWidth(2); c.line(225,105,335,105); c.line(245,150,355,150); c.line(225,105,245,150); c.line(335,105,355,150); c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial",10); c.drawString(232,116,"112°"); c.showPage()

def third(c):
    header(c,"הוכחה גאומטרית — חושבים כמו מתמטיקאים","נתון → כלל → מסקנה",3)
    c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial",15); c.drawRightString(555,690,rtl("ד. הוכחה קצרה"))
    y = question(c,658,8,"נתון: שתי זוויות קודקודיות, ואחת מהן 83°. כתבו טענה ונימוק מלאים.",2)
    y = question(c,y,9,"נתון: שני ישרים מקבילים. כתבו כלל אחד שמאפשר להסיק שוויון זוויות.",2)
    question(c,y,10,"השלימו: x = 106° כי x + 74° = 180°. מהו הנימוק הגאומטרי?",2)
    c.setFillColor(HexColor("#F2B134")); c.roundRect(55,245,500,80,8,fill=1,stroke=0); c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial",11); c.drawRightString(540,296,rtl("תבנית הוכחה: נתון → כלל מתאים → מסקנה. השרטוט עוזר להבין, אך אינו נימוק.")); c.drawRightString(540,270,rtl("אתגר: נסחו שאלה על זוויות קודקודיות וכתבו לה פתרון מלא."))
    c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial",15); c.drawRightString(555,210,rtl("תשובות לבדיקה עצמית")); c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial",10)
    c.drawRightString(555,180,rtl("1. 107°   2. 118°   3. 64°   4. 57°   5. 70°   6. 85°")); c.drawRightString(555,158,rtl("7. סמוכה: 68°; נגדית: 112°   8. הזווית השנייה 83°, כי זוויות קודקודיות שוות.")); c.drawRightString(555,136,rtl("10. זוויות צמודות על ישר משלימות ל־180°.")); c.showPage()

def fourth(c):
    header(c,"תרגול נוסף — זוויות ומשולשים","עוברים בהדרגה: בסיס, יישום ואתגר",4)
    c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial",15); c.drawRightString(555,690,rtl("ה. תרגול עצמאי"))
    y=question(c,658,11,"זווית אחת על ישר היא 146°. חשבו את הזווית הצמודה לה.")
    y=question(c,y,12,"במשולש ישר־זווית זווית חדה אחת היא 37°. מצאו את הזווית החדה השנייה.")
    y=question(c,y,13,"במשולש שווה־שוקיים זוויות הבסיס הן 58° כל אחת. מצאו את זווית הראש.")
    y=question(c,y,14,"במקבילית זווית אחת היא 77°. כתבו את מידות שלוש הזוויות האחרות.",2)
    y=question(c,y,15,"הסבירו מדוע משולש בעל זוויות 80°, 60°, 50° אינו יכול להתקיים.",2)
    question(c,y,16,"כתבו נימוק מתאים: זווית אחת שווה ל־90° כי היא מסומנת בריבוע קטן.")
    c.setFillColor(HexColor("#F2B134")); c.roundRect(55,75,500,46,8,fill=1,stroke=0); c.setFillColor(HexColor("#1D3B34")); c.setFont("Arial",10); c.drawRightString(545,94,rtl("זכרו: במשולש הסכום תמיד 180°; במרובע הסכום תמיד 360°.")); c.showPage()

def fifth(c):
    header(c,"אתגר מסכם","בעיות מילוליות והוכחה — כתבו דרך מלאה",5)
    c.setFillColor(HexColor("#1F7A8C")); c.setFont("Arial",15); c.drawRightString(555,690,rtl("ו. חושבים ומסבירים"))
    y=question(c,658,17,"במשולש זווית אחת גדולה פי שניים מזווית אחרת, והשלישית היא 40°. מצאו את שלוש הזוויות.",3)
    y=question(c,y,18,"בשני ישרים מקבילים זווית אחת היא 123°. אילו מידות אפשריות לכל שמונה הזוויות? הסבירו.",3)
    y=question(c,y,19,"מצאו טעות: תלמיד כתב שסכום זוויות במשולש הוא 360°. כתבו תיקון ונימוק.",2)
    question(c,y,20,"נסחו הוכחה בת שלוש שורות: נתון ש־a ו־b זוויות קודקודיות ו־a=92°.",3)
    c.setFillColor(HexColor("#2F9E6A")); c.roundRect(55,88,500,52,8,fill=1,stroke=0); c.setFillColor(white); c.setFont("Arial",11); c.drawRightString(540,112,rtl("משימת רשות: ציירו משולש משלכם, סמנו שתי זוויות, וכתבו שאלה לחבר או לחברה.")); c.save()

OUT.parent.mkdir(parents=True, exist_ok=True)
ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Arial", r"C:\\Windows\\Fonts\\arial.ttf"))
canvas = Canvas(str(OUT), pagesize=A4)
first(canvas)
second(canvas)
third(canvas)
fourth(canvas)
fifth(canvas)
copyfile(OUT, ASSET_OUT)
print("worksheet created")
