// Taxonomy for the PUBLIC (crawlable) layer of the site.
//
// The learning system itself is private: every course/chapter/exercise lives
// behind login. This file describes the *public* shape of that content —
// which grade a course belongs to, which subject hub it hangs under, and the
// hand-written Hebrew copy for the hub pages — so scripts/seo/build_catalog.mjs
// can turn courses/*.json into a browsable public catalog.
//
// COURSE_GRADES mirrors backend/seed.py's map of the same name. Keep them in
// sync: build_catalog.mjs warns for any seeded course that has no grade and
// no Karni track here, which is exactly what a drifted map looks like.

export const COURSE_GRADES = {
  'grade5-whole-numbers': '5',
  'grade5-decimals': '5',
  'grade5-simple-fractions': '5',
  'divisibility-primes': '5',
  'grade6-fractions-decimals': '6',
  'grade6-percents': '6',
  'grade6-ratio-rate': '6',
  'grade56-geometry-measurement': '6',
  'grade56-data-statistics-probability': '6',
  'arithmetic-laws': '7',
  'directed-numbers': '7',
  'grade7-algebra': '7',
  'powers-and-exponents': '7',
  'proportion-variation': '7',
  'geometry-angles-proofs': '7',
  functions: '8',
  'shortcut-formulas': '8',
  'two-equations-two-unknowns': '8',
  'congruence-similarity': '9',
  'analytic-geometry': '9',
  'factoring-quadratics': '9',
  'quadratic-function': '9',
  'statistics-probability': '9',
  'quadratic-equations': 'hs',
  'טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים': 'hs',
  'חשבון-דיפרנציאלי-נגזרות': 'hs',
}

// Two courses carry a Hebrew slug in production (renaming them would orphan
// the videos already published against those slugs). The public course page
// shares its route with the private course view (App.jsx's
// CourseOrCourseViewRoute) precisely so a signed-in user can land on either
// one at the same URL — which means the public slug MUST equal the DB slug,
// Hebrew and all, rather than a prettier alias. No aliasing here on purpose.
export const PUBLIC_SLUG_ALIASES = {}

export const GRADES = [
  {
    key: '5',
    path: 'grade-5',
    label: 'כיתה ה׳',
    title: 'חשבון לכיתה ה׳',
    metaTitle: 'חשבון לכיתה ה׳ — לימוד ותרגול אונליין',
    description:
      'חשבון לכיתה ה׳ לפי תוכנית הלימודים: מספרים גדולים וארבע פעולות החשבון, שברים פשוטים, מספרים עשרוניים, התחלקות וראשוניים. כל נושא עם הסבר, וידאו, תרגול ודף עבודה.',
    intro:
      'כיתה ה׳ היא השנה שבה החשבון מפסיק להיות רק "לחשב" ומתחיל להיות "להבין למה". התלמידים פוגשים לראשונה מספרים גדולים באמת, לומדים לעבוד עם חלקים של שלם — שברים פשוטים ומספרים עשרוניים — ומתחילים להכיר את חוקי ההתחלקות. הקורסים כאן בנויים בדיוק בסדר הזה, וכל פרק פותח בהסבר בשפה של ילד בן עשר, ממשיך בדוגמאות פתורות ונגמר בתרגול עם משוב מיידי.',
  },
  {
    key: '6',
    path: 'grade-6',
    label: 'כיתה ו׳',
    title: 'חשבון לכיתה ו׳',
    metaTitle: 'חשבון לכיתה ו׳ — לימוד ותרגול אונליין',
    description:
      'חשבון לכיתה ו׳: כפל וחילוק שברים ומספרים עשרוניים, אחוזים, יחס וקנה מידה ובעיות תנועה — עם הסברים, וידאו, תרגול ודפי עבודה להדפסה.',
    intro:
      'כיתה ו׳ סוגרת את בית הספר היסודי ומכינה לחטיבה. השברים והעשרוניים כבר לא רק מושווים ומחוברים אלא גם מוכפלים ומחולקים, נכנס עולם האחוזים שמלווה את התלמיד מכאן והלאה, ומופיעות בעיות היחס, קנה המידה והתנועה — הבעיות המילוליות הראשונות שדורשות לתרגם סיפור לשפה של מתמטיקה.',
  },
  {
    key: '7',
    path: 'grade-7',
    label: 'כיתה ז׳',
    title: 'מתמטיקה לכיתה ז׳',
    metaTitle: 'מתמטיקה לכיתה ז׳ — לימוד ותרגול אונליין',
    description:
      'מתמטיקה לכיתה ז׳: סדר פעולות וחוקי החשבון, מספרים מכוונים (שליליים), חזקות, ביטויים אלגבריים ומשוואות, פרופורציה והשתנות. הסברים, תרגול ומבחנים.',
    intro:
      'כיתה ז׳ היא המעבר הגדול: מהחשבון אל האלגברה. במקום מספרים בלבד מופיעות אותיות, במקום תרגיל מופיעה משוואה, ולראשונה יש מספרים משני צדי האפס. השנה הזאת היא הבסיס לכל מה שיבוא אחריה — פער שנפתח כאן נגרר עד התיכון, ולכן כל פרק כאן חוזר גם על מה שהיה צריך לדעת קודם.',
  },
  {
    key: '8',
    path: 'grade-8',
    label: 'כיתה ח׳',
    title: 'מתמטיקה לכיתה ח׳',
    metaTitle: 'מתמטיקה לכיתה ח׳ — לימוד ותרגול אונליין',
    description:
      'מתמטיקה לכיתה ח׳: פונקציות ומערכת צירים, הפונקציה הקווית, נוסחאות הכפל המקוצר ומערכת שתי משוואות בשני נעלמים — עם הסבר, וידאו ותרגול לכל פרק.',
    intro:
      'בכיתה ח׳ נכנס המושג המרכזי של המתמטיקה התיכונית — הפונקציה. התלמידים לומדים לקרוא גרף, להבין מה הוא מספר על הסיפור שמאחוריו, ולעבור בין ייצוג מילולי, טבלה, גרף ונוסחה. לצד זה מגיעים הכלים האלגבריים הכבדים יותר: נוסחאות הכפל המקוצר ומערכת של שתי משוואות בשני נעלמים.',
  },
  {
    key: '9',
    path: 'grade-9',
    label: 'כיתה ט׳',
    title: 'מתמטיקה לכיתה ט׳',
    metaTitle: 'מתמטיקה לכיתה ט׳ — לימוד ותרגול אונליין',
    description:
      'מתמטיקה לכיתה ט׳: חפיפה ודמיון משולשים, גיאומטריה אנליטית, פירוק לגורמים ומשוואות ריבועיות, הפונקציה הריבועית, סטטיסטיקה והסתברות.',
    intro:
      'כיתה ט׳ היא שנת ההכרעה לפני התיכון: כאן נקבעת ברוב בתי הספר רמת הלימוד לבגרות. הנושאים כבר תיכוניים באופיים — הוכחה גיאומטרית מסודרת, המפגש בין האלגברה לגיאומטריה בציר הקואורדינטות, המשוואה הריבועית והפרבולה. מי שנכנס לתיכון עם שליטה בנושאים האלה מתחיל את כיתה י׳ בלי חוב.',
  },
  {
    key: 'hs',
    path: 'high-school',
    label: 'תיכון',
    title: 'מתמטיקה לתיכון',
    metaTitle: 'מתמטיקה לתיכון — קורסים לפי נושא לקראת הבגרות',
    description:
      'מתמטיקה לתיכון לפי נושא: משוואות ריבועיות, טריגונומטריה וחשבון דיפרנציאלי (נגזרות) — קורסים מלאים עם הסברים, דוגמאות פתורות ותרגול לקראת הבגרות.',
    intro:
      'בתיכון הלמידה כבר לא מתנהלת לפי שנה אלא לפי נושא: כל נושא בבגרות עומד בפני עצמו, וכמעט תמיד הקושי הוא לא בנושא עצמו אלא בבסיס שמתחתיו. הקורסים כאן בנויים כיחידות נושא שלמות — מהיסוד ועד השאלה המורכבת — כדי שאפשר יהיה להשלים בדיוק את מה שחסר.',
  },
]

// Subject hubs — mirror the sections seeded in backend/seed.py (seed_sections).
export const SUBJECTS = [
  {
    slug: 'whole-numbers',
    title: 'מספרים ופעולות חשבון',
    description:
      'היסודות: מבנה המספר העשרוני וערך המקום עד מיליונים, קריאה, כתיבה והשוואה של מספרים גדולים, עיגול והערכה, ועד חיבור וחיסור במאונך, כפל במאונך וחילוק ארוך עם שארית.',
    courseSlugs: ['grade5-whole-numbers'],
  },
  {
    slug: 'divisibility',
    title: 'התחלקות וראשוניים',
    description:
      'עולם ההתחלקות: מסימני ההתחלקות ומספרים ראשוניים ומורכבים, ועד פירוק לגורמים ראשוניים, המחלק המשותף המקסימלי והכפולה המשותפת המינימלית.',
    courseSlugs: ['divisibility-primes'],
  },
  {
    slug: 'fractions',
    title: 'שברים ומספרים עשרוניים',
    description:
      'עולם השברים: ממשמעות השבר, ההשוואה, הצמצום וההרחבה והחיבור והחיסור, דרך מבנה המספר העשרוני, ערך המקום, ההשוואה והעיגול, ועד כפל וחילוק של שברים ושל מספרים עשרוניים.',
    courseSlugs: ['grade5-simple-fractions', 'grade5-decimals', 'grade6-fractions-decimals'],
  },
  {
    slug: 'percents',
    title: 'אחוזים',
    description:
      'עולם האחוזים: מהמושג והקשר לשברים ולעשרוניים, דרך חישובי אחוז מכמות ומציאת השלם, ועד הנחות, התייקרויות ומע"מ.',
    courseSlugs: ['grade6-percents'],
  },
  {
    slug: 'ratio-motion',
    title: 'יחס, קנה מידה ותנועה',
    description:
      'עולם היחס: השוואת כמויות וחלוקה לפי יחס, קנה מידה במפות ובשרטוטים, פרופורציה והשתנות ישרה והפוכה, ובעיות תנועה והספק — מהירות, זמן, דרך וקצב עבודה.',
    courseSlugs: ['grade6-ratio-rate', 'proportion-variation'],
  },
  {
    slug: 'arithmetic-laws',
    title: 'סדר פעולות וחוקי החשבון',
    description:
      'עולם חוקי החשבון: מכללי סדר הפעולות, דרך חוקי החילוף, הקיבוץ והפילוג, חיסור סכום והפרש ותכונות החילוק, ועד חזקות עם מעריך טבעי ושורש ריבועי.',
    courseSlugs: ['arithmetic-laws', 'powers-and-exponents'],
  },
  {
    slug: 'directed-numbers',
    title: 'מספרים מכוונים',
    description:
      'עולם המספרים המכוונים: מציר המספרים, מספרים שליליים, נגדיים וערך מוחלט, ועד חיבור, חיסור, כפל וחילוק של מספרים מכוונים, פעולות מעורבות וחזקות.',
    courseSlugs: ['directed-numbers'],
  },
  {
    slug: 'algebra',
    title: 'אלגברה',
    description:
      'עולם האלגברה: ממשתנים וביטויים אלגבריים, דרך פתיחת סוגריים, הוצאת גורם משותף ונוסחאות הכפל המקוצר, ועד משוואות, אי-שוויונות, בעיות מילוליות ומערכות משוואות.',
    courseSlugs: ['grade7-algebra', 'shortcut-formulas', 'two-equations-two-unknowns'],
  },
  {
    slug: 'functions',
    title: 'פונקציות',
    description:
      'עולם הפונקציות: ממערכת הצירים הקרטזית וקריאת גרפים מהחיים, דרך מושג הפונקציה וייצוגיה, ועד עלייה וירידה, קצב השתנות, תחומי חיוביות ושליליות והפונקציה הקווית.',
    courseSlugs: ['functions'],
  },
  {
    slug: 'geometry-foundations',
    title: 'גאומטריה: זוויות, משולשים והוכחות',
    description:
      'עולם הגאומטריה לכיתה ז׳: מקריאת סימונים וסוגי זוויות, דרך ישרים מקבילים, משולשים ומרובעים, ועד תיכון, גובה, חוצה זווית, משפטי חפיפה והוכחות במשולש שווה־שוקיים.',
    courseSlugs: ['geometry-angles-proofs'],
  },
  {
    slug: 'congruence-similarity',
    title: 'חפיפה ודמיון של משולשים',
    description:
      'עולם ההוכחה בגיאומטריה: משפטי החפיפה צ.ז.צ, ז.צ.ז וצ.צ.צ וכתיבת הוכחה מסודרת, דרך דמיון משולשים ומשפט תאלס, ועד היחס בין היקפים ובין שטחים.',
    courseSlugs: ['congruence-similarity'],
  },
  {
    slug: 'analytic-geometry',
    title: 'גיאומטריה אנליטית',
    description:
      'עולם המפגש בין האלגברה לגיאומטריה: מרחק בין שתי נקודות ואמצע קטע, דרך שיפוע ומשוואת הישר, ישרים מקבילים ומאונכים, ועד חקר משולשים ומרובעים לפי שיעורי הקודקודים.',
    courseSlugs: ['analytic-geometry'],
  },
  {
    slug: 'factoring-quadratics',
    title: 'פירוק לגורמים ומשוואות ריבועיות',
    description:
      'עולם המשוואה הריבועית: מהוצאת גורם משותף ופירוק לפי נוסחאות הכפל המקוצר, דרך פירוק טרינום, ועד נוסחת השורשים, הדיסקרימיננט ובעיות מילוליות.',
    courseSlugs: ['factoring-quadratics', 'quadratic-equations'],
  },
  {
    slug: 'quadratic-function',
    title: 'הפונקציה הריבועית והפרבולה',
    description:
      'עולם הפרבולה: מהפונקציה הבסיסית וצורתה, דרך השפעת המקדם על הפתיחה והכיוון, הזזות והצורה הכללית, ועד הקודקוד, ציר הסימטריה ונקודות החיתוך עם הצירים.',
    courseSlugs: ['quadratic-function'],
  },
  {
    slug: 'statistics-probability',
    title: 'סטטיסטיקה והסתברות',
    description:
      'עולם הנתונים והסיכויים: מאיסוף נתונים וטבלת שכיחויות, דרך תרשימי עמודות ועוגה ומדדי מרכז — ממוצע, חציון ושכיח, ועד מרחב המדגם ותרשים עץ.',
    courseSlugs: ['statistics-probability'],
  },
  {
    slug: 'trigonometry',
    title: 'טריגונומטריה',
    description:
      'עולם הטריגונומטריה: מהיחסים במשולש ישר-זווית — סינוס, קוסינוס וטנגנס — דרך מציאת צלעות וזוויות חסרות, ועד משפט הסינוסים ומשפט הקוסינוסים במשולש כללי.',
    courseSlugs: ['טריגונומטריה-ממשולש-ישר-זווית-ועד-משפט-הקוסינוסים'],
  },
  {
    slug: 'calculus',
    title: 'חשבון דיפרנציאלי',
    description:
      'עולם הנגזרות: ממושג הגבול ושיפוע המשיק, דרך כללי הגזירה של פולינומים, מכפלה ומנה, ועד חקירת פונקציות — נקודות קיצון, תחומי עלייה וירידה ושרטוט הגרף.',
    courseSlugs: ['חשבון-דיפרנציאלי-נגזרות'],
  },
]

// The Karni (מכון קרני) entrance-exam track — grouped by exam area rather
// than by school year, exactly like the private /psy hub.
export const KARNI_AREAS = [
  {
    slug: 'verbal',
    title: 'חשיבה מילולית',
    description:
      'אנלוגיות מילוליות, השלמת משפטים, יוצא דופן והבנת הנקרא — התחום שבודק אוצר מילים ודיוק בקריאה.',
    courseSlugs: [
      'karni-verbal-analogies',
      'karni-verbal-completion',
      'karni-verbal-odd-one-out',
      'karni-verbal-reading',
    ],
  },
  {
    slug: 'quant',
    title: 'חשיבה כמותית',
    description:
      'מספרים, שברים ואחוזים, גאומטריה, בעיות מילוליות ואסטרטגיות פתרון מהירות לפרק הכמותי.',
    courseSlugs: [
      'karni-quant-numbers',
      'karni-quant-geometry',
      'karni-quant-word-problems',
      'karni-quant-strategies',
    ],
  },
  {
    slug: 'figural',
    title: 'חשיבה צורנית',
    description: 'סדרות צורניות, מטריצות ואנלוגיות צורניות — לזהות את הכלל שמאחורי הצורות.',
    courseSlugs: [
      'karni-figural-basics',
      'karni-figural-series',
      'karni-figural-matrices',
      'karni-figural-analogies',
    ],
  },
  {
    slug: 'reasoning',
    title: 'לוגיקה, סדרות וחשיבה מרחבית',
    description:
      'חשיבה לוגית והסקת מסקנות, סדרות מספרים ואותיות, ופריסות וקוביות בחשיבה מרחבית.',
    courseSlugs: ['karni-logic-deduction', 'karni-series', 'karni-spatial-nets'],
  },
  {
    slug: 'english-speed',
    title: 'אנגלית, זריזות ודיוק',
    description:
      'אוצר מילים ודקדוק באנגלית לרמת המבחן, ופרק הזריזות והדיוק שבו הזמן הוא האתגר האמיתי.',
    courseSlugs: ['karni-english-vocabulary', 'karni-english-grammar', 'karni-speed-accuracy'],
  },
]
