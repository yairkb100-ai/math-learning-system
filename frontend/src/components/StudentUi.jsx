// אבני בניין משותפות לדפי התלמיד שאחרי השיעור (תרגול, מבחנים, התקדמות,
// הישגים, קבצים…): כותרת עמוד אחידה, מצב ריק שמזמין לפעולה הבאה, ואייקוני SVG
// במקום האמוג׳י שמגיע מהמסד (achievement.icon / exam.icon) — לפי CLAUDE.md
// אייקונים הם תמיד SVG מ-icons.jsx.
import {
  IconArrowStart,
  IconBook,
  IconCheck,
  IconClipboard,
  IconCompass,
  IconLayers,
  IconPencil,
  IconShield,
  IconSpark,
  IconTarget,
  IconTrophy,
} from './icons.jsx'

export function PageHead({ title, lead, children }) {
  return (
    <header className="page-head sa-head">
      <div className="sa-head-text">
        <h1>{title}</h1>
        {lead && <p className="sa-head-lead">{lead}</p>}
      </div>
      {children && <div className="sa-head-actions">{children}</div>}
    </header>
  )
}

export function EmptyState({ icon, title, children, actions, compact = false }) {
  return (
    <div className={`sa-empty${compact ? ' is-compact' : ''}`}>
      {icon && (
        <span className="sa-empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {title && <h2 className="sa-empty-title">{title}</h2>}
      {children && <div className="sa-empty-body">{children}</div>}
      {actions && <div className="sa-empty-actions">{actions}</div>}
    </div>
  )
}

const ACHIEVEMENT_ICONS = {
  first_steps: IconArrowStart,
  practice_10: IconPencil,
  practice_50: IconLayers,
  streak_5: IconSpark,
  streak_10: IconShield,
  sharpshooter: IconTarget,
  exam_first: IconClipboard,
  exam_pass: IconCheck,
  exam_perfect: IconTrophy,
}

export function AchievementIcon({ code, ...rest }) {
  const Icon = ACHIEVEMENT_ICONS[code] || IconTrophy
  return <Icon {...rest} />
}

const EXAM_ICONS = {
  math: IconCompass,
  psychometric: IconLayers,
  logic: IconLayers,
  english: IconBook,
  verbal: IconBook,
}

export function ExamIcon({ subject, ...rest }) {
  const Icon = EXAM_ICONS[subject] || IconClipboard
  return <Icon {...rest} />
}

export const SUBJECT_HE = {
  math: 'מתמטיקה',
  psychometric: 'פסיכומטרי',
  english: 'אנגלית',
  logic: 'לוגיקה',
  verbal: 'מילולי',
}
export const subjectLabel = (s) => SUBJECT_HE[s] || s

export const DIFFICULTY_HE = { easy: 'קל', medium: 'בינוני', hard: 'קשה' }
export const difficultyLabel = (d) => DIFFICULTY_HE[d] || d
