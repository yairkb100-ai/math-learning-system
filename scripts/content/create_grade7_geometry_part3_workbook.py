# -*- coding: utf-8 -*-
"""Eight-page RTL workbook for grade-7 geometry course part 3."""
from pathlib import Path
import re
from shutil import copyfile

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "חוברת-גאומטריה-שטחים-בניות-וזוויות-חיצוניות-כיתה-ז.pdf"
ASSET_OUT = ROOT / "courses" / "assets" / "geometry-angles-proofs--part-3" / "חוברת-תרגול-שטחים-בניות-וזוויות-חיצוניות-8-עמודים.pdf"
INK = HexColor("#1D3B34")
ACCENT = HexColor("#1F7A8C")
GREEN = HexColor("#2F9E6A")
MARKER = HexColor("#F2B134")
GRID = HexColor("#D7E1DD")
BOARD = HexColor("#173F36")
PALE = HexColor("#E8F2EE")


def rtl(text):
    """Visual Hebrew order while preserving formulas, numbers and Latin labels."""
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


def grid(c):
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
    c.drawRightString(width - 40, height - 116, rtl(f"עמוד {page} מתוך 8 | שם: ____________________"))
    grid(c)


def section(c, y, text):
    c.setFillColor(ACCENT)
    c.setFont("Arial-Bold", 15)
    c.drawRightString(555, y, rtl(text))
    return y - 30


def question(c, y, number, text, lines=2):
    c.setFillColor(INK)
    c.setFont("Arial", 10.5)
    c.drawRightString(555, y, rtl(f"{number}. {text}"))
    c.setStrokeColor(HexColor("#AFC4BC"))
    for row in range(lines):
        c.line(55, y - 21 - row * 19, 555, y - 21 - row * 19)
    return y - 38 - lines * 19


def note(c, y, lines):
    height = 26 + len(lines) * 20
    c.setFillColor(PALE)
    c.setStrokeColor(GREEN)
    c.roundRect(55, y - height, 500, height, 10, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Arial", 10)
    for index, line in enumerate(lines):
        c.drawRightString(540, y - 24 - index * 20, rtl(line))
    return y - height - 24


def triangle_area(c):
    c.setStrokeColor(INK); c.setLineWidth(2.3)
    c.line(155, 430, 415, 430); c.line(155, 430, 330, 610); c.line(330, 610, 415, 430)
    c.setStrokeColor(ACCENT); c.setDash(5, 4); c.line(330, 610, 330, 430); c.setDash()
    c.setStrokeColor(MARKER); c.line(330, 430, 348, 430); c.line(348, 430, 348, 448)
    c.setFillColor(INK); c.setFont("Arial-Bold", 10); c.drawString(278, 414, "b"); c.drawString(340, 520, "h")


def trapezoid(c):
    c.setStrokeColor(INK); c.setLineWidth(2.3)
    c.line(135, 455, 440, 455); c.line(205, 585, 375, 585); c.line(135, 455, 205, 585); c.line(440, 455, 375, 585)
    c.setStrokeColor(ACCENT); c.setDash(5, 4); c.line(205, 585, 205, 455); c.setDash()
    c.setStrokeColor(MARKER); c.line(205, 455, 222, 455); c.line(222, 455, 222, 472)
    c.setFillColor(INK); c.setFont("Arial-Bold", 10); c.drawCentredString(287, 438, "b2"); c.drawCentredString(290, 592, "b1"); c.drawString(214, 515, "h")


def construction(c):
    c.setStrokeColor(INK); c.setLineWidth(2.3); c.line(140, 440, 435, 440)
    c.setStrokeColor(ACCENT); c.setDash(6, 4); c.arc(55, 350, 365, 660, 0, 72)
    c.setStrokeColor(GREEN); c.arc(255, 350, 575, 670, 108, 72); c.setDash()
    c.setStrokeColor(INK); c.line(140, 440, 287, 595); c.line(435, 440, 287, 595)
    c.setFillColor(MARKER); c.circle(287, 595, 4, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont("Arial-Bold", 10); c.drawString(126, 423, "B"); c.drawString(440, 423, "C"); c.drawString(282, 610, "A")


def exterior(c):
    c.setStrokeColor(INK); c.setLineWidth(2.3)
    c.line(145, 440, 375, 440); c.line(145, 440, 265, 605); c.line(265, 605, 375, 440); c.line(375, 440, 500, 440)
    c.setStrokeColor(MARKER); c.setLineWidth(2.3); c.arc(355, 420, 415, 480, 0, 62)
    c.setFillColor(MARKER); c.setFont("Arial-Bold", 12); c.drawString(414, 462, "α")
    c.setStrokeColor(ACCENT); c.arc(130, 425, 180, 475, 0, 52); c.arc(242, 572, 288, 618, 227, 86)


def page_one(c):
    header(c, "שטח משולש", "בסיס וגובה מתאימים - לא מסתמכים על מראה", 1)
    y = section(c, 690, "הגובה חייב להיות מאונך לבסיס")
    y = note(c, y, ["נוסחת השטח: בסיס כפול גובה מתאים, חלקי 2.", "יחידות שטח הן יחידות ריבועיות: סמ״ר, מ״ר וכן הלאה."])
    triangle_area(c)
    y = question(c, 380, 1, "בסיס משולש הוא 12 ס״מ וגובהו 7 ס״מ. חשבו את השטח.")
    y = question(c, y, 2, "שטח משולש הוא 54 סמ״ר ובסיסו 9 ס״מ. מצאו את הגובה.")
    question(c, y, 3, "במשולש קהה הגובה נופל מחוץ לצורה. הסבירו מדוע הוא עדיין גובה תקין.", 3)
    c.showPage()


def page_two(c):
    header(c, "שטחי מצולעים", "מקבילית, טרפז ופירוק לצורות מוכרות", 2)
    y = section(c, 690, "מפרקים, מחשבים ובודקים יחידות")
    trapezoid(c)
    y = question(c, 405, 4, "מקבילית: בסיס 11 ס״מ וגובה 6 ס״מ. חשבו את השטח.")
    y = question(c, y, 5, "טרפז: הבסיסים 8 ו-14 ס״מ והגובה 5 ס״מ. חשבו את השטח.")
    y = question(c, y, 6, "ממלבן ששטחו 80 סמ״ר גזרו משולש ששטחו 18 סמ״ר. מה נותר?")
    question(c, y, 7, "לכמה משולשים מחלקים מחומש קמור בעזרת אלכסונים מקודקוד אחד?", 2)
    c.showPage()


def page_three(c):
    header(c, "בנייה לפי שלוש צלעות", "קשתות מחוגה ואי-שוויון המשולש", 3)
    y = section(c, 690, "נקודת חיתוך הקשתות היא הקודקוד השלישי")
    construction(c)
    y = note(c, 400, ["אפשר לבנות משולש רק אם סכום שתי הצלעות הקצרות גדול מן הארוכה."])
    y = question(c, y, 8, "האם האורכים 4, 5, 7 יוצרים משולש? נמקו.")
    y = question(c, y, 9, "האם האורכים 3, 4, 8 יוצרים משולש? נמקו.")
    y = question(c, y, 10, "מה מתקבל מן האורכים 5, 5, 10 - משולש או קו ישר?")
    question(c, y, 11, "תארו במילים בנייה של משולש שצלעותיו 4, 5, 7 ס״מ.", 3)
    c.showPage()


def page_four(c):
    header(c, "אילו נתונים קובעים משולש?", "צ.ז.צ, ז.צ.ז ומה אינו מספיק", 4)
    y = section(c, 690, "בנייה היא גם הסבר למשפטי החפיפה")
    y = note(c, y, ["צ.ז.צ: בונים צלע, זווית כלואה וצלע שנייה.", "ז.צ.ז: בונים צלע כלואה ושתי זוויות בקצותיה.", "ז.ז.ז קובע צורה, אך אינו קובע גודל."])
    y = question(c, y, 12, "נתונות צלעות 6 ו-9 ס״מ והזווית הכלואה 50°. האם נקבע משולש יחיד?")
    y = question(c, y, 13, "נתונה צלע 8 ס״מ ושתי זוויות בקצותיה: 45° ו-65°. מצאו את הזווית השלישית.")
    y = question(c, y, 14, "מדוע שלוש זוויות בלבד אינן מספיקות להוכחת חפיפה?", 3)
    question(c, y, 15, "הסבירו מדוע שתי צלעות וזווית שאינה כלואה אינן תמיד קובעות משולש יחיד.", 3)
    c.showPage()


def page_five(c):
    header(c, "זווית חיצונית במשולש", "המשך צלע ושתי הזוויות הפנימיות המרוחקות", 5)
    y = section(c, 690, "הזווית החיצונית נמצאת מחוץ למשולש - וזה תקין")
    exterior(c)
    y = note(c, 400, ["זווית חיצונית שווה לסכום שתי הזוויות הפנימיות שאינן צמודות לה."])
    y = question(c, y, 16, "הזוויות המרוחקות הן 42° ו-73°. מצאו את הזווית החיצונית.")
    y = question(c, y, 17, "זווית חיצונית היא 128° ואחת המרוחקות 49°. מצאו את השנייה.")
    y = question(c, y, 18, "הזווית הפנימית הצמודה היא 124°. מצאו את החיצונית.")
    question(c, y, 19, "מדוע זווית חיצונית גדולה מכל אחת משתי הזוויות המרוחקות בנפרד?", 3)
    c.showPage()


def page_six(c):
    header(c, "זוויות במצולעים", "סיבוב מלא, מצולע משוכלל וסכום פנימי", 6)
    y = section(c, 690, "בכל הקפה מלאה מסתובבים 360°")
    y = note(c, y, ["סכום הזוויות החיצוניות במצולע קמור הוא 360°.", "סכום הזוויות הפנימיות במצולע בעל n צלעות הוא 180° כפול (n-2)."])
    y = question(c, y, 20, "מהו סכום הזוויות החיצוניות במחומש קמור?", 1)
    y = question(c, y, 21, "מצאו זווית חיצונית וזווית פנימית במחומש משוכלל.")
    y = question(c, y, 22, "במצולע משוכלל כל זווית חיצונית 30°. כמה צלעות יש בו?")
    question(c, y, 23, "חשבו את סכום הזוויות הפנימיות במתומן.", 2)
    c.showPage()


def page_seven(c):
    header(c, "אתגר מסכם", "משלבים שטח, בנייה וזוויות", 7)
    y = section(c, 690, "כתבו דרך מלאה ולא רק תשובה")
    y = question(c, y, 24, "בסיס משולש 16 ס״מ וגובהו 9 ס״מ. חשבו שטח.")
    y = question(c, y, 25, "שטח טרפז 96 סמ״ר ובסיסיו 10 ו-14 ס״מ. מצאו את הגובה.", 3)
    y = question(c, y, 26, "זווית חיצונית במשולש 140° ואחת המרוחקות 65°. מצאו את השנייה.")
    y = question(c, y, 27, "במצולע משוכלל הזווית הפנימית 150°. מצאו זווית חיצונית ומספר צלעות.", 3)
    note(c, y, ["בדיקת סוף: יחידה ריבועית בשטח; נימוק בבנייה; בחירה נכונה של הזוויות המרוחקות."])
    c.showPage()


def page_eight(c):
    header(c, "תשובות והערכת דרך", "בדקו חישוב, נימוק ויחידות", 8)
    y = section(c, 690, "תשובות 1-14")
    y = note(c, y, [
        "1. 42 סמ״ר.  2. 12 ס״מ.  3. הגובה הוא מרחק מאונך לישר הבסיס.",
        "4. 66 סמ״ר.  5. 55 סמ״ר.  6. 62 סמ״ר.  7. שלושה משולשים.",
        "8. כן, כי 4+5>7.  9. לא, כי 3+4<8.  10. קו ישר.",
        "11. בסיס 7 ושתי קשתות ברדיוסים 4 ו-5.  12. כן, לפי צ.ז.צ.",
        "13. 70°.  14. אפשר להגדיל ולהקטין משולש בלי לשנות את זוויותיו.",
    ])
    y = section(c, y, "תשובות 15-27")
    y = note(c, y, [
        "15. עלולים להתקבל שני משולשים שונים.  16. 115°.  17. 79°.  18. 56°.",
        "19. היא סכום שתי זוויות חיוביות.  20. 360°.  21. חיצונית 72°; פנימית 108°.",
        "22. 12 צלעות.  23. 1080°.  24. 72 סמ״ר.  25. 8 ס״מ.",
        "26. 75°.  27. חיצונית 30° ולכן 12 צלעות.",
    ])
    c.setFillColor(GREEN); c.roundRect(55, 92, 500, 65, 10, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("Arial-Bold", 11)
    c.drawRightString(540, 127, rtl("שאלה אחת לא הצליחה? חזרו אליה, סמנו את הנתונים וכתבו את הכלל לפני החישוב."))
    c.drawRightString(540, 105, rtl("פתרון טוב כולל תשובה, דרך ונימוק - לא ניחוש לפי השרטוט."))
    c.save()


OUT.parent.mkdir(parents=True, exist_ok=True)
ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
canvas = Canvas(str(OUT), pagesize=A4)
for page in (page_one, page_two, page_three, page_four, page_five, page_six, page_seven, page_eight):
    page(canvas)
copyfile(OUT, ASSET_OUT)
print("part 3 workbook created")
