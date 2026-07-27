// Hype phrases for the celebration toast. Hebrew has grammatical gender and
// we don't know the student's, so every phrase uses the combined "/"" form
// (e.g. "תותח/ית") rather than picking one — matches how the product owner
// phrased the request. Keep the register energetic/informal, not formal praise.

// Quick phrases for a single correct answer (quiz/exercise/practice) — short,
// punchy, one line.
export const SMALL_HYPE = [
  'תותח/ית!',
  'אלוף/ה!',
  'ווינר/ית!',
  'אש!',
  'מדויק/ת בול!',
  'חד/ה כתער!',
  'עשית את זה!',
  'בום!',
  'איזה קולע/ת!',
  'ישר לשם!',
  'וואו, שיגעון!',
  'זה היה חלק!',
  'פצצה של תשובה!',
  'קטן עליך/עלייך!',
  'פשוט מטורף/ת!',
]

// Bigger phrases for a milestone — a chapter finished, an exam passed. Can
// be a full short sentence since these show in a larger, centered banner.
export const BIG_HYPE = [
  'וואו תותח/ית! פרק שלם מאחוריך/מאחורייך!',
  'אלוף/ה אמיתי/ת — עוד ניצחון בכיס!',
  'ניצחת את הפרק הזה כמו ווינר/ית!',
  'וואו! פסגה חדשה נכבשה!',
  'יאללה תותח/ית, ממשיכים ככה!',
  'זהו זה — את/ה פשוט אלוף/ה!',
  'עוד פרק נופל, את/ה בלתי עצור/ה!',
  'איזה ביצוע, תותח/ית! פשוט מטורף!',
  'ככה עושים את זה, סחתיין!',
  'סחתיין! זה היה אדיר!',
]

export function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)]
}
