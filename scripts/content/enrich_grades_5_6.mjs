// Adds a reusable explanation, visual check and extra practice layer to grades 5–6.
// Existing lessons stay intact; run the course builders afterwards to publish sources.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MARKER = '## חיזוק ההבנה: רואים, מסבירים ובודקים'
const EXTRA_TITLE = 'חיזוק נוסף: מסבירים ובודקים'

const profiles = {
  'whole-numbers': {
    focus: 'במספרים טבעיים לא מסתפקים בביצוע פעולה. לפני החישוב אומדים את סדר הגודל, בזמן החישוב שומרים על ערכי המקום, ובסוף משווים בין התוצאה המדויקת לאומדן. שלושת השלבים עוזרים לגלות ספרה שנשמטה, העברה שלא בוצעה או פעולה שאינה מתאימה לסיפור.',
    visual: '{{grid:4x5/20|עשרים יחידות מסודרות בארבע קבוצות שוות — כפל וחילוק הם דרכים שונות לקרוא אותו מבנה}}',
    exercise: ['אומדן ואז חישוב', 'חשבו $398+207$. לפני החישוב כתבו אומדן למאות, ואחריו הסבירו כיצד הוא בודק את התוצאה המדויקת.', 'easy', 'באומדן: $400+200=600$. בחישוב מדויק: $398+207=605$. התוצאה קרובה ל־$600$, ולכן סדר הגודל הגיוני.'],
  },
  'simple-fractions': {
    focus: 'בשבר, המכנה קובע לכמה חלקים שווים חילקנו את השלם והמונה קובע כמה חלקים נבחרו. לכן משווים, מחברים או מרחיבים שברים רק אחרי שמוודאים מהו אותו שלם ומה גודלו של כל חלק. ציור קצר של פס שבר הופך כלל סמלי לרעיון שאפשר לראות.',
    visual: '{{bar:3/4|שלושה מתוך ארבעה חלקים שווים — המחשה של $\\frac{3}{4}$}}',
    exercise: ['שני שמות לאותו חלק', 'הראו בעזרת הרחבה מדוע $\\frac{3}{4}=\\frac{6}{8}$, והסבירו מה השתנה ומה נשאר קבוע.', 'medium', 'כופלים מונה ומכנה ב־$2$: $\\frac{3\\cdot2}{4\\cdot2}=\\frac{6}{8}$. מספר החלקים וגודל כל חלק השתנו, אך הכמות הכוללת נשארה זהה.'],
  },
  decimals: {
    focus: 'מספר עשרוני הוא דרך נוספת לתאר חלקים של יחידה. הספרה הראשונה אחרי הנקודה מייצגת עשיריות, השנייה מאיות והשלישית אלפיות. כשמשווים או מחברים מספרים עשרוניים מיישרים את הנקודות, משום שרק כך יחידות מחוברות ליחידות ומאיות למאיות.',
    visual: '{{bar:37/100|שלושים ושבע מאיות של יחידה — המחשה של $0.37$}}',
    exercise: ['מיישרים ערכי מקום', 'חשבו $2.35+0.7$, כתבו את $0.7$ במאיות והסבירו מדוע יישור הנקודות חשוב.', 'easy', '$0.7=0.70$, ולכן $2.35+0.70=3.05$. יישור הנקודות מבטיח שעשיריות מתחברות לעשיריות ומאיות למאיות.'],
  },
  divisibility: {
    focus: 'כלל התחלקות הוא קיצור לבדיקת המבנה של מספר. אחרי שמפעילים את הכלל כדאי לאמת בעזרת חילוק או פירוק לגורמים. אם מתקבלת מנה שלמה ללא שארית, המספר מתחלק; אם נשאר חלק, הכלל או החישוב דורשים בדיקה נוספת.',
    visual: '{{grid:3x4/12|שתים־עשרה יחידות מסתדרות גם בשלוש שורות וגם בארבע עמודות — לכן $3$ ו־$4$ הם גורמים של $12$}}',
    exercise: ['כלל ובדיקה', 'בדקו אם $246$ מתחלק ב־$3$: השתמשו בכלל סכום הספרות ואחר כך אמתו בחילוק.', 'easy', '$2+4+6=12$, ו־$12$ מתחלק ב־$3$, לכן גם $246$ מתחלק ב־$3$. בחילוק מתקבל $246\\div3=82$ ללא שארית.'],
  },
  'fractions-decimals': {
    focus: 'שבר פשוט ומספר עשרוני יכולים לתאר בדיוק את אותה נקודה על ישר המספרים. כדי לעבור בין הייצוגים אפשר ליצור מכנה $10$, $100$ או $1{,}000$, או לבצע חילוק של המונה במכנה. בסיום בודקים שהערך נמצא במקום הצפוי ביחס ל־$0$, ל־$1$ ולמספרים שלמים סמוכים.',
    visual: '{{bar:3/5|אותו חלק אפשר לכתוב $\\frac{3}{5}$, $\\frac{6}{10}$ או $0.6$}}',
    exercise: ['שלושה ייצוגים לערך אחד', 'המירו את $\\frac{3}{5}$ למספר עשרוני ולאחוז, והסבירו כיצד אפשר לבדוק את התוצאה באיור.', 'medium', '$\\frac{3}{5}=\\frac{6}{10}=0.6=60\\%$. בפס המחולק לחמישה חלקים, שלושה חלקים צבועים — יותר מחצי ופחות משלם, כפי שמתאים ל־$0.6$.'],
  },
  percents: {
    focus: 'אחוז הוא שבר שהמכנה שלו $100$. לפני שמחשבים מסמנים מהו השלם, מהו האחוז המבוקש ומהי הכמות החלקית. אחר כך בוחרים דרך: מעבר לשבר, מעבר לעשרוני או פירוק לאחוזים נוחים כמו $10\\%$, $5\\%$ ו־$1\\%$.',
    visual: '{{bar:25/100|עשרים וחמישה מתוך מאה הם $25\\%$, כלומר רבע מן השלם}}',
    exercise: ['אחוז מכמות', 'מצאו $25\\%$ מתוך $80$ בשתי דרכים: בעזרת רבע ובעזרת מספר עשרוני.', 'easy', '$25\\%=\\frac14$, ולכן $80\\div4=20$. גם $0.25\\cdot80=20$. שתי הדרכים נותנות אותה כמות.'],
  },
  'ratio-rate': {
    focus: 'יחס משווה בין כמויות באותו סדר, וקצב משווה בין כמויות בעלות יחידות שונות. כותבים ליד כל מספר את משמעותו, מגדילים או מקטינים את שני חלקי היחס באותו גורם, ובסוף בודקים שהיחידות והתשובה מתאימות לסיפור.',
    visual: '{{ratiobar:2:3|שתי יחידות מסוג אחד מול שלוש יחידות מסוג אחר — יחס $2:3$}}',
    exercise: ['מגדילים יחס בלי לשנותו', 'במתכון היחס בין כוסות מים לכוסות אורז הוא $2:3$. כמה כוסות מים דרושות ל־$9$ כוסות אורז?', 'medium', 'הכמות של האורז גדלה מ־$3$ ל־$9$, כלומר פי $3$. לכן גם המים גדלים פי $3$: $2\\cdot3=6$ כוסות.'],
  },
  geometry: {
    focus: 'במדידה ובגאומטריה מתחילים בשרטוט מסומן ובוחרים יחידה מתאימה. היקף מתאר את המסלול מסביב לצורה, שטח מתאר כמה היא מכסה ונפח מתאר כמה מקום גוף ממלא. כתיבת היחידה בכל שלב היא כלי בדיקה: אורך ביחידות רגילות, שטח ביחידות ריבועיות ונפח ביחידות מעוקבות.',
    visual: '{{rect:5x3|מלבן באורך $5$ וברוחב $3$: ההיקף עובר מסביב והשטח ממלא את הפנים}}',
    exercise: ['אותה צורה, שתי שאלות', 'למלבן אורך $5\\text{ cm}$ ורוחב $3\\text{ cm}$. חשבו היקף ושטח והסבירו מדוע היחידות שונות.', 'medium', 'היקף: $2(5+3)=16\\text{ cm}$. שטח: $5\\cdot3=15\\text{ cm}^2$. היקף מודד קו ולכן יחידתו אורך; שטח מודד כיסוי ולכן יחידתו ריבועית.'],
  },
  data: {
    focus: 'בנתונים ובהסתברות מגדירים קודם מה מייצגת כל תצפית ומהו השלם. קוראים כותרת, צירים ויחידות לפני שמחשבים. אחר כך משווים שכיחויות או מחשבים חלק מתוך הכול, ובסיום בודקים שהמסקנה נתמכת בנתונים ולא רק ברושם חזותי.',
    visual: '{{barchart:א=4;ב=7;ג=5|תרשים עמודות: הגובה מאפשר להשוות שכיחויות, אך את הערכים קוראים לפי הסקלה}}',
    exercise: ['קוראים תרשים ומנמקים', 'בסקר התקבלו השכיחויות: א׳ — $4$, ב׳ — $7$, ג׳ — $5$. כמה תשובות נאספו ומה ההפרש בין הקבוצה השכיחה ביותר לפחות שכיחה?', 'easy', 'בסך הכול $4+7+5=16$ תשובות. ב׳ היא השכיחה ביותר וא׳ הפחות שכיחה, וההפרש הוא $7-4=3$.'],
  },
}

function addLearningLayer(chapter, profile, targetExercises = 5) {
  if (!chapter.content.includes(MARKER)) {
    chapter.content += `\n\n${MARKER}\n\n${profile.focus}\n\n${profile.visual}\n\n### דרך עבודה בשלושה צעדים\n\n1. **מייצגים:** כותבים מה ידוע ומה מחפשים, ומוסיפים ציור, טבלה או סימון מתאים.\n2. **פותרים:** מבצעים בכל שורה פעולה אחת ומצרפים יחידות כשצריך.\n3. **בודקים:** משתמשים באומדן, בפעולה הפוכה או בייצוג נוסף ומסבירים במשפט מדוע התוצאה הגיונית.\n\nההרגל הזה חשוב לא פחות מהתשובה: הוא הופך פתרון מרצף סימנים להסבר מתמטי שאפשר לעקוב אחריו ולתקן.`
  }
  const [title, description, difficulty, solution] = profile.exercise
  while ((chapter.exercises?.length ?? 0) < targetExercises) {
    chapter.exercises ||= []
    const suffix = chapter.exercises.some((exercise) => exercise.title === title) ? ` — דרך נוספת ${chapter.exercises.length + 1}` : ''
    chapter.exercises.push({
      number: chapter.exercises.length + 1,
      title: `${title}${suffix}`,
      description,
      difficulty,
      solution,
      ...(chapter.exercises.some((exercise) => Object.hasOwn(exercise, 'answer')) ? { answer: solution } : {}),
    })
  }
}

function updateAssets(file, profile) {
  const assets = JSON.parse(fs.readFileSync(file, 'utf8'))
  assets.extra_exercises ||= []
  if (!assets.extra_exercises.some((exercise) => exercise.title === EXTRA_TITLE)) {
    const [, description, difficulty, solution] = profile.exercise
    assets.extra_exercises.push({ title: EXTRA_TITLE, difficulty, description, solution })
    fs.writeFileSync(file, `${JSON.stringify(assets, null, 2)}\n`, 'utf8')
  }
}

let changed = 0
for (const grade of ['grade5', 'grade6']) {
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
      addLearningLayer(chapter, profile)
      fs.writeFileSync(chapterFile, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8')
      updateAssets(assetsFile, profile)
      changed += 1
    }
  }
}

for (const [slug, profileName] of [
  ['grade56-geometry-measurement', 'geometry'],
  ['grade56-data-statistics-probability', 'data'],
]) {
  const file = path.join(ROOT, 'courses', `${slug}.json`)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const chapter of payload.course.chapters) {
    const repeatedPrefix = `${profiles[profileName].exercise[0]} — דרך נוספת`
    chapter.exercises = chapter.exercises.filter((exercise) => !exercise.title.startsWith(repeatedPrefix))
    addLearningLayer(chapter, profiles[profileName], 4)
    changed += 1
  }
  payload.course.metadata.word_count = payload.course.chapters.reduce(
    (sum, chapter) => sum + chapter.content.replace(/\{\{[^}]+\}\}/g, '').split(/\s+/).filter(Boolean).length,
    0,
  )
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

console.log(`Enriched ${changed} chapters across grades 5–6.`)
