// Adds a small, reusable learning layer to every existing chapter in grades 7–9.
// Source files remain the authority; run the course builder afterwards to publish.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MARKER = '## חיזוק ההבנה: עוצרים, מציירים ובודקים'

const profiles = {
  algebra: {
    visual: '{{grid:3x4/12|ייצוג חזותי: אפשר לבדוק פעולה אלגברית גם בעזרת קבוצות שוות}}',
    focus: 'מגדירים במילים מה מייצגת כל אות, כותבים פעולה אחת בכל שורה, ורק אז מפשטים או פותרים. בסוף מציבים את התשובה בחזרה במשפט המקורי — לא רק בשורה האחרונה של החישוב.',
    exercise: ['בדיקת ביטוי או פתרון', 'בחרו ערך נוח למשתנה, חשבו את שני אגפי הביטוי או המשוואה, והסבירו מה הבדיקה מלמדת על התוצאה.', 'medium', 'הצבה של אותו ערך בכל מקום היא בדיקה תקפה: אם שני האגפים אמורים להיות שווים, הם חייבים לקבל אותו ערך. אם לא, חוזרים לשלב שבו השתנה סימן, מקדם או סדר פעולות.'],
  },
  'arithmetic-laws': {
    visual: '{{bar:3/5|המחשה: פיצול של כמות לחלקים שומר על הערך הכולל}}',
    focus: 'חוק חשבון אינו טריק לזיכרון אלא דרך לשמור על אותו ערך בכתיב אחר. כדאי לפתוח או לפרק צעד אחד, ואז לבדוק במספרים פשוטים ששני הביטויים באמת נותנים אותה תוצאה.',
    exercise: ['בדיקת חוק חשבון', 'כתבו שני ביטויים שווי־ערך לפי החוק שנלמד בפרק, והציבו בהם מספר נוח כדי לוודא שהערך נשמר.', 'medium', 'אם משתמשים בחוק נכון, שני הביטויים מחזירים אותו ערך לכל הצבה. ההצבה אינה הוכחה מלאה, אבל היא כלי מצוין לגילוי טעות בסימן או בסוגריים.'],
  },
  'directed-numbers': {
    visual: '{{signedline:-5;3|על ציר המספרים: תנועה ימינה מגדילה ותנועה שמאלה מקטינה}}',
    focus: 'לפני שמחשבים, מתרגמים כל סימן לסיפור על הציר: התחלה, כיוון וגודל תנועה. כך מינוס כפול מינוס אינו כלל מנותק, אלא פעולה הפוכה של כיוון הפוך.',
    exercise: ['מסלול על ציר המספרים', 'התחילו ב־$-4$, זוזו $7$ יחידות ימינה ואז $3$ יחידות שמאלה. כתבו תרגיל מתאים ומצאו את נקודת הסיום.', 'easy', '$-4+7-3=0$. אפשר לראות זאת גם על הציר: מ־$-4$ מגיעים ל־$3$, ואז חוזרים שלוש יחידות ל־$0$.'],
  },
  'powers-and-exponents': {
    visual: '{{grid:3x3/9|ריבוע של $3$ מיוצג כתשע יחידות מסודרות}}',
    focus: 'כדי לא להתבלבל בין חזקה לכפל רגיל, אומרים במילים מה החזקה מייצגת: כמה פעמים אותו גורם מוכפל בעצמו. רק גורמים זהים מאפשרים לקצר לפי חוקי חזקות.',
    exercise: ['פירוק חזקה', 'כתבו את $2^4$ כמכפלה, חשבו, והסבירו מדוע הוא אינו שווה ל־$2\cdot4$.', 'easy', '$2^4=2\cdot2\cdot2\cdot2=16$. לעומת זאת $2\cdot4=8$; המעריך מציין כפל חוזר של הבסיס, לא כפל במספר המעריך.'],
  },
  proportion: {
    visual: '{{ratiobar:2:3|ייצוג של יחס: שני חלקים מול שלושה חלקים שווים}}',
    focus: 'ביחס ובפרופורציה חשוב לזהות מה נשאר קבוע. כופלים או מחלקים את שני חלקי היחס באותו מספר, ובודקים שהיחידות מתאימות לפני שמסיקים מסקנה.',
    exercise: ['שומרים על יחס', 'ביחס של $2:3$ הגדילו את שני החלקים פי $4$. כתבו את היחס החדש והסבירו מדוע הוא שקול ליחס המקורי.', 'easy', '$2\cdot4:3\cdot4=8:12$. חילקנו או כפלנו את שני חלקי היחס באותו מספר, ולכן היחס נשמר.'],
  },
  functions: {
    visual: '{{funcline:2,1|ישר לדוגמה: צעד אחד ימינה ושתי יחידות למעלה, עם נקודת התחלה $1$}}',
    focus: 'בטבלה, בגרף ובנוסחה מחפשים את אותו קשר. בחרו שתי נקודות, קראו את השינוי ב־$x$ וב־$y$, ובדקו שהנוסחה מחזירה את שתיהן. התאמה של נקודה אחת בלבד אינה מספיקה.',
    exercise: ['נקודה בודקת פונקציה', 'בדקו האם הנקודה $(3,7)$ נמצאת על הישר $y=2x+1$. הסבירו את הבדיקה.', 'easy', 'מציבים $x=3$: מתקבל $y=2\cdot3+1=7$. מכיוון שהתקבל שיעור ה־$y$ של הנקודה, היא נמצאת על הישר.'],
  },
  'shortcut-formulas': {
    visual: '{{rect:5x3|מלבן מדגים פירוק של מכפלה לסכום שטחים}}',
    focus: 'נוסחאות כפל מקוצר הן קיצור של מבנה מוכר. לפני השימוש בהן מזהים את שני האיברים ואת הסימן ביניהם; לאחר הפיתוח בודקים את איברי הקצה ואת האיבר האמצעי.',
    exercise: ['בדיקת נוסחה מקוצרת', 'פתחו את $(x+3)^2$ בעזרת הנוסחה, ואז הציבו $x=2$ כדי לבדוק.', 'medium', '$(x+3)^2=x^2+6x+9$. עבור $x=2$ מתקבלים בשני הצדדים $25$: משמאל $(2+3)^2$, ומימין $4+12+9$.'],
  },
  'two-equations-two-unknowns': {
    visual: '{{linesystem:1,1;-1,5|נקודת החיתוך של שני ישרים היא פתרון משותף לשתי משוואות}}',
    focus: 'במערכת משוואות כל משוואה מוסיפה תנאי. אחרי מציאת זוג מספרים מציבים אותו בשתי המשוואות המקוריות ומפרשים אותו במילים — כך מגלים אם הפתרון מתאים גם לסיפור.',
    exercise: ['בדיקה בשתי משוואות', 'בדקו אם הזוג $(2,3)$ פותר את המערכת $x+y=5$ ו־$x-y=-1$.', 'easy', 'בהצבה: $2+3=5$ וגם $2-3=-1$. הזוג מקיים את שתי המשוואות ולכן הוא הפתרון.'],
  },
  'analytic-geometry': {
    visual: '{{axespoints:2,3;-2,1;1,-3|שלוש נקודות במערכת צירים מאפשרות לקרוא כיוון ומרחק}}',
    focus: 'בגאומטריה אנליטית הציור והחישוב בודקים זה את זה. מסמנים נקודות בסדר הנכון, כותבים נוסחה עם סוגריים סביב מספרים שליליים, ולבסוף בודקים שהכיוון והאורך נראים הגיוניים.',
    exercise: ['בדיקת נקודה על ישר', 'בדקו האם $(2,5)$ נמצאת על הישר $y=2x+1$.', 'easy', 'מציבים $x=2$: מתקבל $2\cdot2+1=5$. לכן הנקודה נמצאת על הישר.'],
  },
  'congruence-similarity': {
    visual: '{{triangle:3,4,5|שרטוט מסייע לסמן את הצלעות והזוויות המתאימות לפני הוכחה}}',
    focus: 'בהוכחה גאומטרית כל סימון זקוק לנימוק: נתון, הגדרה או משפט. התאימו קודם קודקודים בין הצורות ורק אחר כך השוו צלעות או זוויות; מראה השרטוט לבדו אינו הוכחה.',
    exercise: ['נימוק מדויק', 'במשולש שבו שתי צלעות שוות, מה אפשר לומר על הזוויות שמולן? כתבו גם את שם המשפט.', 'medium', 'הזוויות שמול הצלעות השוות שוות זו לזו, לפי משפט המשולש שווה־השוקיים. יש לציין את ההתאמה בין הצלעות לזוויות.'],
  },
  'factoring-quadratics': {
    visual: '{{rect:4x3|שטח מלבן מחבר בין גורמים למכפלה}}',
    focus: 'פירוק לגורמים הוא כתיבה של אותו ביטוי כמכפלה. אחרי הפירוק תמיד פותחים את הסוגריים בחזרה: אם מתקבל הביטוי המקורי, הפירוק נכון; אם לא, מחפשים סימן או מכפלה שגויים.',
    exercise: ['בדיקת פירוק', 'פרקו $x^2+5x$ לגורמים ובדקו בפתיחת סוגריים.', 'easy', '$x^2+5x=x(x+5)$. פתיחה חוזרת נותנת $x\cdot x+x\cdot5=x^2+5x$, ולכן הפירוק נכון.'],
  },
  'quadratic-function': {
    visual: '{{parabola:1,0,0|פרבולה בסיסית: קודקוד בראשית וציר סימטריה אנכי}}',
    focus: 'בפונקציה ריבועית בודקים תמיד שלושה דברים יחד: הקודקוד, כיוון הפתיחה ונקודות החיתוך. שרטוט סקיצה קצרה לפני החישוב עוזר לזהות אם תוצאה או סימן אינם הגיוניים.',
    exercise: ['קריאת פרבולה בסיסית', 'בפונקציה $y=x^2$ מצאו את ערך הפונקציה עבור $x=-3$ והסבירו מדוע הוא חיובי.', 'easy', '$(-3)^2=9$. החזקה השנייה מכפילה שני מספרים שליליים, ולכן התוצאה חיובית.'],
  },
  'statistics-probability': {
    visual: '{{barchart:כן=12;לא=18|עמודות מאפשרות להשוות שכיחויות לפני המעבר לאחוזים}}',
    focus: 'בנתונים ובהסתברות מגדירים קודם את השלם ואת היחידה: מתוך כמה? מהו אירוע? רק אחר כך מחשבים שכיחות, אחוז או הסתברות. בסיום בודקים שהתוצאה נמצאת בין $0$ ל־$1$ או בין $0\%$ ל־$100\%$.',
    exercise: ['בדיקת הסתברות', 'בקופסה 3 כדורים אדומים ו־7 כחולים. מה ההסתברות להוציא אדום, ומהי בדיקת ההיגיון?', 'easy', 'יש 10 כדורים בסך הכול, ולכן ההסתברות היא $\frac{3}{10}=0.3=30\%$. התוצאה בין 0 ל־1, ונמוכה מחצי כי יש פחות אדומים מכחולים.'],
  },
}

function updateChapter(file, profile) {
  const chapter = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!chapter.content.includes(MARKER)) {
    chapter.content += `\n\n${MARKER}\n\n${profile.focus}\n\n${profile.visual}\n\n**בדיקת זהב:** בוחרים נתון קטן ונוח, מבצעים את הפעולה בשתי דרכים אם אפשר, ומסבירים במשפט אחד למה התוצאה מתאימה לשאלה. בדיקה אינה תוספת — היא חלק מהפתרון.`
  }
  if (chapter.exercises.length < 5) {
    const [title, description, difficulty, solution] = profile.exercise
    chapter.exercises.push({ number: chapter.exercises.length + 1, title, description, difficulty, solution })
  }
  fs.writeFileSync(file, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8')
}

function updateAssets(file, chapter, profile) {
  const assets = JSON.parse(fs.readFileSync(file, 'utf8'))
  assets.extra_exercises ||= []
  const title = 'חיזוק נוסף: בודקים ומנמקים'
  if (!assets.extra_exercises.some((exercise) => exercise.title === title)) {
    const [, description, difficulty, solution] = profile.exercise
    assets.extra_exercises.push({ title, difficulty, description, solution })
    fs.writeFileSync(file, `${JSON.stringify(assets, null, 2)}\n`, 'utf8')
  }
}

let changed = 0
for (const grade of ['grade7', 'grade8', 'grade9']) {
  const gradeDir = path.join(ROOT, 'content', grade)
  for (const courseName of fs.readdirSync(gradeDir)) {
    const profile = profiles[courseName]
    if (!profile) throw new Error(`Missing enrichment profile for ${grade}/${courseName}`)
    const courseDir = path.join(gradeDir, courseName)
    for (const entry of fs.readdirSync(courseDir).filter((name) => /^ch\d+$/.test(name)).sort()) {
      const chapterFile = path.join(courseDir, entry, 'chapter.json')
      const assetsFile = path.join(courseDir, entry, 'assets.json')
      if (!fs.existsSync(chapterFile) || !fs.existsSync(assetsFile)) throw new Error(`Missing source in ${grade}/${courseName}/${entry}`)
      const chapter = JSON.parse(fs.readFileSync(chapterFile, 'utf8'))
      updateChapter(chapterFile, profile)
      updateAssets(assetsFile, chapter, profile)
      changed += 1
    }
  }
}
console.log(`Enriched ${changed} chapters across grades 7–9.`)
