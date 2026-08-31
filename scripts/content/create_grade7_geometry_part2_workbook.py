# -*- coding: utf-8 -*-
"""Ten-page RTL workbook for geometry course part 2, with answer key."""
from pathlib import Path
import re
from shutil import copyfile

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "חוברת-גאומטריה-חפיפה-והוכחות-כיתה-ז.pdf"
ASSET_OUT = ROOT / "courses" / "assets" / "geometry-angles-proofs--part-2" / "חוברת-תרגול-חפיפה-והוכחות-10-עמודים.pdf"
INK = HexColor("#1D3B34")
ACCENT = HexColor("#1F7A8C")
GREEN = HexColor("#2F9E6A")
MARKER = HexColor("#F2B134")
GRID = HexColor("#D7E1DD")
BOARD = HexColor("#173F36")


def rtl(text):
    """Simple Hebrew visual ordering while keeping numbers/formulas readable."""
    values = []

    def keep(match):
        token = f"@@{len(values)}@@"
        values.append(match.group(0))
        return token

    protected = re.sub(r"[A-Za-z0-9°△∠⊥≅=+×÷.,()'/: -]+", keep, str(text))
    result = protected[::-1]
    for index, value in enumerate(values):
        result = result.replace(f"@@{index}@@"[::-1], value)
    return result


def draw_grid(c):
    width, height = A4
    c.setStrokeColor(GRID)
    c.setLineWidth(0.25)
    for x in range(35, int(width), 20):
        c.line(x, 55, x, height - 105)
    for y in range(60, int(height - 100), 20):
        c.line(35, y, width - 35, y)


def header(c, title, subtitle, page):
    width, height = A4
    c.setFillColor(BOARD)
    c.rect(0, height - 92, width, 92, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Arial-Bold", 20)
    c.drawRightString(width - 40, height - 38, rtl(title))
    c.setFont("Arial", 10)
    c.drawRightString(width - 40, height - 61, rtl(subtitle))
    c.setFillColor(INK)
    c.drawRightString(width - 40, height - 116, rtl(f"עמוד {page} מתוך 10 | שם: ____________________"))
    draw_grid(c)


def section(c, y, text):
    c.setFillColor(ACCENT)
    c.setFont("Arial-Bold", 15)
    c.drawRightString(555, y, rtl(text))
    return y - 28


def note(c, y, lines):
    height = 24 + 18 * len(lines)
    c.setFillColor(HexColor("#EEF4F1"))
    c.setStrokeColor(GREEN)
    c.setLineWidth(1.2)
    c.roundRect(55, y - height, 500, height, 8, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Arial", 10)
    for index, line in enumerate(lines):
        c.drawRightString(540, y - 20 - index * 18, rtl(line))
    return y - height - 18


def question(c, y, number, text, lines=2):
    c.setFillColor(INK)
    c.setFont("Arial", 10.5)
    c.drawRightString(555, y, rtl(f"{number}. {text}"))
    c.setStrokeColor(HexColor("#AFC2BB"))
    for index in range(lines):
        c.line(55, y - 21 - index * 19, 555, y - 21 - index * 19)
    return y - 34 - 19 * lines


def draw_triangle(c, x, y, mode):
    a = (x + 95, y + 145)
    b = (x, y)
    d = (x + 95, y)
    e = (x + 190, y)
    c.setStrokeColor(INK)
    c.setLineWidth(2.2)
    c.line(*a, *b)
    c.line(*a, *e)
    c.line(*b, *e)
    c.setStrokeColor(ACCENT)
    c.line(*a, *d)
    if mode == "altitude":
        c.setStrokeColor(MARKER)
        c.line(d[0], d[1] + 14, d[0] + 14, d[1] + 14)
        c.line(d[0] + 14, d[1] + 14, d[0] + 14, d[1])
    elif mode == "median":
        c.setStrokeColor(GREEN)
        c.line(x + 45, y - 6, x + 45, y + 6)
        c.line(x + 145, y - 6, x + 145, y + 6)
    elif mode == "bisector":
        c.setStrokeColor(MARKER)
        c.arc(a[0] - 25, a[1] - 25, a[0] + 25, a[1] + 25, 220, 25)
        c.arc(a[0] - 25, a[1] - 25, a[0] + 25, a[1] + 25, 245, 25)
        c.setStrokeColor(GREEN)
        c.line(x + 43, y + 68, x + 55, y + 61)
        c.line(x + 135, y + 61, x + 147, y + 68)


def draw_congruence(c, y, mode):
    for offset in (75, 330):
        c.setStrokeColor(INK)
        c.setLineWidth(2)
        c.line(offset, y, offset + 75, y + 120)
        c.line(offset + 75, y + 120, offset + 150, y)
        c.line(offset, y, offset + 150, y)
        c.setStrokeColor(GREEN)
        if mode != "asa":
            c.line(offset + 30, y + 52, offset + 42, y + 45)
            c.line(offset + 105, y + 48, offset + 117, y + 55)
            c.line(offset + 111, y + 42, offset + 123, y + 49)
        if mode == "sss":
            c.line(offset + 68, y - 6, offset + 68, y + 6)
            c.line(offset + 75, y - 6, offset + 75, y + 6)
            c.line(offset + 82, y - 6, offset + 82, y + 6)
        elif mode == "sas":
            c.setStrokeColor(MARKER)
            c.arc(offset + 52, y + 88, offset + 98, y + 132, 220, 95)
        else:
            c.line(offset + 75, y - 6, offset + 75, y + 6)
            c.setStrokeColor(MARKER)
            c.arc(offset - 2, y - 1, offset + 42, y + 43, 0, 58)
            c.arc(offset + 108, y - 1, offset + 152, y + 43, 122, 58)


def page_one(c):
    header(c, "קטעים מיוחדים במשולש", "תיכון, גובה וחוצה זווית - קוראים את הסימונים", 1)
    y = section(c, 690, "שלושה קטעים שנראים דומים אך אומרים דברים שונים")
    y = note(c, y, ["תיכון מגיע לאמצע הצלע: BD = DC.", "גובה מאונך לצלע: AD ⊥ BC.", "חוצה זווית מחלק זווית לשתי זוויות שוות."])
    draw_triangle(c, 90, 360, "median")
    draw_triangle(c, 315, 360, "altitude")
    c.setFont("Arial-Bold", 10)
    c.setFillColor(INK)
    c.drawCentredString(185, 342, rtl("תיכון"))
    c.drawCentredString(410, 342, rtl("גובה"))
    y = question(c, 310, 1, "AD תיכון ל-BC ו-BC=18. מצאו BD ו-DC.")
    y = question(c, y, 2, "AD גובה ל-BC. מה מידות הזוויות ADB ו-ADC?")
    question(c, y, 3, "AD חוצה את זווית A=74°. מצאו את שתי הזוויות שנוצרו.")
    c.showPage()


def page_two(c):
    header(c, "תרגול קטעים מיוחדים", "לא מסתמכים על מראה השרטוט", 2)
    y = section(c, 690, "כתבו ליד כל תשובה גם את הנימוק")
    y = question(c, y, 4, "בשרטוט קטע נראה באמצע הבסיס, אך אין סימון. האם מותר להסיק שהוא תיכון?", 3)
    y = question(c, y, 5, "AD גם תיכון וגם גובה. כתבו שני קשרים שנובעים מכך.", 3)
    y = question(c, y, 6, "AD חוצה זווית. BAD=3x ו-DAC=x+40. מצאו x ואת שתי הזוויות.", 3)
    y = question(c, y, 7, "ציירו משולש וסמנו בו תיכון באמצעות שנתות שוות.", 4)
    note(c, y, ["בדיקה: שנתות = אורכים שווים; ריבוע = 90°; קשתות = זוויות שוות."])
    c.showPage()


def page_three(c):
    header(c, "חפיפה לפי צ.צ.צ", "שלושה זוגות צלעות מתאימות שוות", 3)
    y = section(c, 690, "קוראים את משפחות השנתות")
    draw_congruence(c, 500, "sss")
    y = note(c, 472, ["אם AB=DE, BC=EF, AC=DF - המשולשים חופפים לפי צ.צ.צ.", "לאחר החפיפה מותר להסיק שכל החלקים המתאימים שווים."])
    y = question(c, y, 8, "נתון AB=DE ו-BC=EF. איזה שוויון ישלים צ.צ.צ?")
    y = question(c, y, 9, "הקטע AD משותף לשני משולשים. כתבו את השוויון ואת הנימוק.")
    question(c, y, 10, "ABC חופף ל-DEF. איזו זווית מתאימה לזווית B?")
    c.showPage()


def page_four(c):
    header(c, "חפיפה לפי צ.ז.צ", "הזווית חייבת להיות כלואה בין שתי הצלעות", 4)
    y = section(c, 690, "בודקים את מיקום הזווית")
    draw_congruence(c, 500, "sas")
    y = note(c, 472, ["AB=DE, AC=DF וגם זווית A שווה לזווית D.", "A ו-D הן הזוויות שבין זוגות הצלעות - לכן צ.ז.צ."])
    y = question(c, y, 11, "נתון AB=DE ו-AC=DF. אילו זוויות צריכות להיות שוות לצ.ז.צ?")
    y = question(c, y, 12, "הסבירו מדוע שתי צלעות וזווית שאינה ביניהן אינן מוכיחות צ.ז.צ.", 3)
    question(c, y, 13, "כתבו שורת חפיפה מלאה והקפידו על סדר הקודקודים.", 3)
    c.showPage()


def page_five(c):
    header(c, "חפיפה לפי ז.צ.ז", "שתי זוויות והצלע הכלואה ביניהן", 5)
    y = section(c, 690, "לפעמים משלימים זווית בעזרת 180°")
    draw_congruence(c, 500, "asa")
    y = note(c, 472, ["A=D, B=E והצלע AB=DE - לכן ז.צ.ז.", "ז.ז.ז לבדו קובע צורה אך לא גודל, ולכן אינו משפט חפיפה."])
    y = question(c, y, 14, "במשולש זוויות 48° ו-72°. מצאו את השלישית.")
    y = question(c, y, 15, "ABC חופף ל-DFE. איזו צלע מתאימה ל-AC?")
    question(c, y, 16, "הסבירו בקצרה מדוע ז.ז.ז אינו מספיק לחפיפה.", 3)
    c.showPage()


def page_six(c):
    header(c, "משולש שווה-שוקיים", "משפט זוויות הבסיס והמשפט ההפוך", 6)
    y = section(c, 690, "שוקיים שוות מול זוויות בסיס שוות")
    draw_triangle(c, 205, 480, "bisector")
    y = note(c, 450, ["אם AB=AC, אז זווית B שווה לזווית C.", "אם זווית B שווה לזווית C, אז הצלעות שמולן AB ו-AC שוות."])
    y = question(c, y, 17, "זווית הראש 36°. מצאו כל זווית בסיס.")
    y = question(c, y, 18, "זווית בסיס 67°. מצאו את זווית הראש.")
    question(c, y, 19, "במשולש PQR נתון P=Q. אילו צלעות שוות?")
    c.showPage()


def page_seven(c):
    header(c, "הוכחה משולבת", "תיכון לבסיס במשולש שווה-שוקיים", 7)
    y = section(c, 690, "מוכיחים שהתיכון הוא גם גובה וחוצה זווית")
    draw_triangle(c, 205, 500, "median")
    y = note(c, 470, ["AB=AC - נתון; BD=DC - הגדרת תיכון; AD=AD - צלע משותפת.", "לכן ABD חופף ל-ACD לפי צ.צ.צ.", "מן החפיפה: BAD=DAC וגם ADB=ADC."])
    y = question(c, y, 20, "מדוע AD=AD? כתבו את הנימוק המדויק.")
    y = question(c, y, 21, "מדוע הזוויות ADB ו-ADC שוות וגם מסתכמות ל-180°?", 3)
    question(c, y, 22, "השלימו את המסקנה: כל אחת מהן ___ ולכן AD ___ BC.", 2)
    c.showPage()


def page_eight(c):
    header(c, "אתגר מסכם", "נתון - נימוק - מסקנה", 8)
    y = section(c, 690, "פתרו בדרך מלאה")
    y = question(c, y, 23, "AB=AC, D אמצע BC. הוכיחו שהזוויות BAD ו-DAC שוות.", 5)
    y = question(c, y, 24, "שני קטעים נחתכים ב-O. נתון AO=CO וזווית A שווה לזווית C. הוכיחו חפיפה לפי ז.צ.ז.", 5)
    y = question(c, y, 25, "מצאו טעות: תלמיד כתב שהמשולשים חופפים כי הם נראים באותו גודל.", 4)
    note(c, y, ["לפני הסיום: בדקו סדר קודקודים, משפט חפיפה ונימוק לכל שורה."])
    c.showPage()


def page_nine(c):
    header(c, "תשובות לבדיקה עצמית", "עמודים 1-5", 9)
    y = section(c, 690, "תשובות 1-16")
    answers = [
        "1. BD=DC=9.", "2. שתי הזוויות 90°.", "3. כל זווית 37°.",
        "4. לא; דרוש נתון או סימון.", "5. BD=DC וגם AD מאונך ל-BC.",
        "6. 3x=x+40, לכן x=20 ושתי הזוויות 60°.", "7. בשרטוט צריכות להופיע שנתות זהות.",
        "8. AC=DF.", "9. AD=AD, צלע משותפת.", "10. זווית E.",
        "11. זווית A שווה לזווית D.", "12. זו אינה הזווית הכלואה.",
        "13. הסדר חייב להתאים לכל זוג קודקודים.", "14. 60°.", "15. DE.",
        "16. אותן זוויות יכולות להופיע במשולשים בגדלים שונים.",
    ]
    c.setFont("Arial", 10)
    c.setFillColor(INK)
    for answer in answers:
        c.drawRightString(550, y, rtl(answer))
        y -= 30
    c.showPage()


def page_ten(c):
    header(c, "תשובות והערכת דרך", "עמודים 6-8", 10)
    y = section(c, 690, "תשובות 17-25")
    answers = [
        "17. 72° בכל בסיס.", "18. 46°.", "19. QR=PR.", "20. צלע משותפת.",
        "21. שוות מחפיפה; צמודות על הישר BC.", "22. 90°; AD מאונך ל-BC.",
        "23. AB=AC, BD=DC, AD=AD; חפיפה צ.צ.צ; לכן BAD=DAC.",
        "24. AOB=COD קודקודיות; AO=CO; A=C; לכן ז.צ.ז.",
        "25. מראה השרטוט אינו נימוק. דרושים שלושה נתונים לפי משפט חפיפה.",
    ]
    c.setFont("Arial", 10)
    c.setFillColor(INK)
    for answer in answers:
        c.drawRightString(550, y, rtl(answer))
        y -= 38
    y = note(c, 300, ["הערכת דרך: 2 נקודות לזיהוי הנתונים, 2 למשפט הנכון, 2 לסדר התאמה,", "2 לנימוקים ו-2 למסקנה מדויקת. סך הכל 10 נקודות לכל הוכחה."])
    c.setFillColor(GREEN)
    c.roundRect(55, 100, 500, 65, 8, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Arial-Bold", 12)
    c.drawRightString(540, 137, rtl("סיימתם? חזרו לשאלה אחת שבה טעיתם וכתבו את הפתרון מחדש ללא הצצה."))
    c.save()


OUT.parent.mkdir(parents=True, exist_ok=True)
ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
canvas = Canvas(str(OUT), pagesize=A4)
for page in (page_one, page_two, page_three, page_four, page_five, page_six, page_seven, page_eight, page_nine, page_ten):
    page(canvas)
copyfile(OUT, ASSET_OUT)
print("geometry workbook created")
