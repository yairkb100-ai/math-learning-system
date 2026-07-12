# 🚀 הוראות הפעלת Skill: Course Writer

## מה זה Skill?

**Skill** הוא כלי שמופיע ישירות ב-Claude Code וזמין בכל סשן חדש.  
כשתפתח Claude Code, תוכל לכתוב `/skill` ויופיע לך הסקיל שלנו.

---

## שלב 1: בדוק אם Skill כבר פעיל

פתח **Claude Code** (CLI או Web) וכתוב:

```
/skill
```

אם רואים `course-writer` בתוך רשימת ה-skills — **כבר הופעל!** ✅

---

## שלב 2: אם לא רואים את הסקיל

### אפשרות A: דרך VSCode Extension

1. פתח VSCode
2. לחץ על **Claude** בצד שמאל
3. בחלקון ה-Settings (⚙️), בחר **Configure Skills**
4. הוסף קובץ אחד:
   ```
   /path/to/course-writer-skill.yaml
   ```
5. Restart Claude extension

### אפשרות B: דרך Claude.com/code

1. פתח https://claude.com/code
2. בחר **Settings** (⚙️)
3. בחלק **Skills** או **Custom Skills**
4. בחר **Add Skill**
5. Upload את הקובץ:
   ```
   course-writer-skill.yaml
   ```

### אפשרות C: דרך הגדרות נטיביות

1. מצא את קובץ התצורה של Claude Code:
   - **Windows**: `C:\Users\[USERNAME]\AppData\Local\Claude\config.yaml`
   - **Mac**: `~/.claude/config.yaml`
   - **Linux**: `~/.claude/config.yaml`

2. הוסף:
   ```yaml
   skills:
     - path: "./course-writer-skill.yaml"
   ```

3. Restart Claude Code

---

## שלב 3: הפעל את הסקיל

לאחר התקנה, בכל סשן חדש:

```
/skill course-writer
```

או יותר פשוט:

```
/course-writer
```

---

## שימוש בסקיל

### דוגמה 1: קורס בסיסי

```
/course-writer
Create a course on quadratic equations for high school students
```

### דוגמה 2: קורס בעברית

```
/course-writer
כתוב קורס על משוואות ריבועיות לתלמידי כיתה י'
```

### דוגמה 3: קורס מפורט

```
/course-writer
Generate a course with these specifications:
- Topic: Python Programming
- Level: Beginner
- Chapters: 5
- Language: English
- Include: Code examples, Diagrams
```

---

## 📋 פרמטרים שאתה יכול להעביר

```
topic: (חובה) הנושא
"משוואות ריבועיות", "Python", "Digital Marketing"

level: (אופציונלי, ברירת מחדל: Intermediate)
"Beginner" | "Intermediate" | "Advanced"

chapters: (אופציונלי, ברירת מחדל: 5)
3-10

language: (אופציונלי, ברירת מחדל: English)
"Hebrew" | "English" | "Spanish" | "French" | "Arabic"

include: (אופציונלי)
"code-examples", "diagrams", "case-studies", "resources"
```

---

## ✅ בדוק שהכל עובד

כשהסקיל הופעל, אתה אמור לראות:

```
📚 Course Writer — מכתבת לומדות
Description: Generate complete, structured courses...
```

וכשתשלח בקשה:

```
✅ הסקיל מתחיל לעבוד
⏳ כותב את הקורס (3-5 דקות)
📦 מחזיר JSON מובנה עם הקורס המלא
```

---

## 🔧 טרובלשוטינג

### ❓ "לא רואה את הסקיל"

```
בדוק:
1. הקובץ נשמר בנכון: course-writer-skill.yaml
2. עשית Restart ל-Claude Code
3. הקובץ בפורמט YAML תקין (בלי טעויות רווחים)
```

### ❓ "השגיאה: Invalid skill format"

```
וודא שקובץ ה-YAML זה בפורמט תקין:
- אין טאבים, רק spaces
- כל ה-indentation נכון
- אין תווים מיוחדים
```

### ❓ "הסקיל לא מייצר קורס"

```
בדוק:
1. שלחת בקשה תקינה (topic חובה)
2. רק ציפית 3-5 דקות
3. אתה מחובר ל-Claude API (אם משתמש CLI)
```

---

## 📂 מיקום קבצים

```
C:\Users\yairk\OneDrive\שולחן העבודה\rf-learning-system\
├── course-writer-skill.yaml          ← הקובץ הראשי של הסקיל
├── CLAUDE_SKILL_DEFINITION.md        ← תיאור מפורט
├── CLAUDE_SKILL_PLAN.md              ← תוכנית יישום
└── Desktop\
    ├── סקיל_פיתוח_לומדה_מתמטיקה.md  ← מדריך תפעולי
    └── 📖_הפעלת_סקיל_Course_Writer.md ← קובץ זה
```

---

## 🎯 זרימת עבודה מוצעת

```
יום 1: התקנה (5 דק')
├─ העתק course-writer-skill.yaml
├─ הוסף לתצורה
└─ Restart Claude

יום 1: בדיקה (2 דק')
├─ כתוב: /course-writer
├─ שלח בקשה פשוטה
└─ תרגם שהסקיל עובד ✅

יום 2: שימוש (30 דק')
├─ תכנן קורס (5 דק')
├─ קרא לסקיל (2 דק')
├─ חכה לקורס (5 דק')
└─ עדכן וסיים (15 דק')
```

---

## 💡 טיפים

✅ **לפני הקורס הראשון:**
```
כתוב קורס קטן (Beginner, 3 פרקים)
כדי לבדוק שהכל עובד
```

✅ **קורסים מתמטיקה:**
```
/course-writer
Create a mathematics course:
Topic: משוואות ריבועיות
Level: Intermediate
Chapters: 5
Language: Hebrew
Include: Diagrams, Code Examples
```

✅ **אם אתה לא מרוצה:**
```
שלח בקשה נוספת:
"Edit the course: make exercises harder / add examples / fix errors"
הסקיל יעדכן את הקורס
```

---

## 📞 עזרה נוספת

אם יש בעיות:
1. בדוק את `סקיל_פיתוח_לומדה_מתמטיקה.md` לפרטים פיתחונים
2. בדוק את `CLAUDE_SKILL_DEFINITION.md` לגדר טכנית מלאה
3. בדוק בדוקומנטציה של Claude Code: https://claude.com/help

---

**סיימת! 🎉**

אתה כעת יכול להשתמש ב-`/course-writer` בכל סשן חדש!

```bash
/course-writer
כתוב קורס על משוואות ריבועיות
```

וקורס מלא יופיע בתוך 3-5 דקות! ✨
