"""Pydantic schemas for the פסיכוטכני area.

Kept out of schemas.py because the psychometric surface is large and largely
self-contained — and because schemas.py is a shared file several workstreams
touch at once.
"""

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------

class PsyPassageOut(BaseModel):
    slug: str
    title: Optional[str] = None
    kind: str
    body: str
    figure: Optional[str] = None
    word_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PsyItemOut(BaseModel):
    """An item as the student sees it — no answer, no explanation."""

    ref: str
    domain: str
    qtype: str
    topic: Optional[str] = None
    stem: str
    figure: Optional[str] = None
    options: List[str]
    difficulty: int
    # beginner | standard | advanced — היכן השאלה עומדת מול רף מבחן קרני האמיתי.
    # נשלח לנגן כדי שהתלמיד ידע אם הוא מתאמן על חימום או על רמת המבחן.
    level: str = "standard"
    target_seconds: int
    passage: Optional[PsyPassageOut] = None


class PsyItemReveal(BaseModel):
    """The answer side, returned only after the student has answered."""

    ref: str
    correct_index: int
    explanation: Optional[str] = None
    solution: Optional[str] = None


# ---------------------------------------------------------------------------
# Drill (untimed, immediate feedback)
# ---------------------------------------------------------------------------

class PsyDrillAnswer(BaseModel):
    ref: str
    chosen: int
    seconds: int = 0


class PsyDrillResult(BaseModel):
    is_correct: bool
    correct_index: int
    explanation: Optional[str] = None
    solution: Optional[str] = None
    target_seconds: int
    # True when the student got it right but spent well over the target time —
    # on this exam that is a real weakness, so the UI says so.
    over_time: bool = False


class PsyTopicStat(BaseModel):
    domain: str
    topic: str
    answered: int
    correct: int
    accuracy: float
    avg_seconds: float


# ---------------------------------------------------------------------------
# Simulations
# ---------------------------------------------------------------------------

class PsySimSectionInfo(BaseModel):
    order: int
    domain: str
    title: str
    minutes: int
    num_questions: int

    model_config = ConfigDict(from_attributes=True)


class PsySimulationOut(BaseModel):
    slug: str
    title: str
    description: Optional[str] = None
    kind: str
    # None for the standard forms, "advanced" for the harder tier. Drives the
    # badge on the catalog card.
    level: Optional[str] = None
    total_minutes: int
    total_questions: int
    sections: List[PsySimSectionInfo]
    locked: bool = False
    # Best percent-correct the student has already scored on this form, if any.
    best_percent: Optional[float] = None
    attempts_count: int = 0


class PsyAttemptStart(BaseModel):
    attempt_id: int
    section_index: int


class PsySectionState(BaseModel):
    """Everything the player needs to render the current section."""

    attempt_id: int
    status: str
    section_index: int
    sections_total: int
    domain: str
    title: str
    minutes: int
    # Authoritative remaining time, computed server-side. The browser counts
    # down from this rather than owning the clock.
    seconds_left: int
    items: List[PsyItemOut]
    # Answers already recorded for this section: {ref: chosen_index}
    saved: Dict[str, int] = {}


class PsySectionSubmit(BaseModel):
    section_index: int
    # {item_ref: chosen_index}. A missing ref counts as unanswered.
    answers: Dict[str, int] = {}
    # {item_ref: seconds} — per-question timing, drives the pacing report.
    timings: Dict[str, int] = {}
    flagged: List[str] = []


class PsySectionSubmitResult(BaseModel):
    status: str            # in_progress | completed
    next_section: Optional[int] = None
    attempt_id: int


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

class PsyAnswerReview(BaseModel):
    ref: str
    section_index: int
    domain: str
    topic: Optional[str] = None
    qtype: str
    difficulty: int
    stem: str
    figure: Optional[str] = None
    options: List[str]
    chosen: Optional[int] = None
    correct_index: int
    is_correct: bool
    seconds: int
    target_seconds: int
    explanation: Optional[str] = None
    solution: Optional[str] = None
    passage: Optional[PsyPassageOut] = None


class PsySectionResult(BaseModel):
    section_index: int
    domain: str
    title: str
    correct: int
    total: int
    unanswered: int
    seconds: int
    is_pilot: bool = False


class PsyResults(BaseModel):
    attempt_id: int
    simulation_slug: str
    simulation_title: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    # Percent correct overall, and {domain: {correct, total, percent}}.
    # Karni publishes no conversion table, so no scaled score is invented —
    # see app.psy_scoring for why.
    score_percent: Optional[float] = None
    domain_scores: Dict[str, Dict] = {}
    readiness: Optional[Dict] = None
    sections: List[PsySectionResult]
    topics: List[PsyTopicStat]
    review: List[PsyAnswerReview]
    # Prior attempts on any full simulation, oldest first, for the trend line.
    history: List[Dict] = []


class PsyAttemptSummary(BaseModel):
    attempt_id: int
    simulation_slug: str
    simulation_title: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    score_percent: Optional[float] = None
    domain_scores: Dict[str, Dict] = {}


# ---------------------------------------------------------------------------
# Hub
# ---------------------------------------------------------------------------

class PsyCourseCard(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    chapters_count: int
    completed_chapters: int
    section_title: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PsyTopicCard(BaseModel):
    """A topic as a browsable unit of study, not just a drill filter.

    `answered`/`accuracy` are this student's own history on the topic, so the
    hub can show progress per topic rather than only "weakest three".
    """

    domain: str
    topic: str
    count: int          # active items in the bank, regardless of access tier
    # כמה מתוך המאגר דרגת הגישה של התלמיד באמת פותחת לו. בדרגה מלאה זה שווה
    # ל-count; בדרגת free הוא קטן ממנו, והכרטיס אומר "X מתוך Y" במקום לדווח
    # מאגר מוקטן כאילו זה כל מה שקיים.
    open_count: int = 0
    # פיצול המאגר לרמות, כדי שהכרטיס יוכל לומר "מתוך 24: 8 מתחילים,
    # 10 רמת מבחן, 6 מתקדמות" במקום מספר אחד שמערבב את שלושתן.
    # מפתח חסר = אין שאלות ברמה הזו בנושא.
    level_counts: Dict[str, int] = Field(default_factory=dict)
    answered: int = 0
    accuracy: Optional[float] = None
    # שיוך הנושא לקורס/פרק הלימוד שלו, כדי שהעמוד יוכל להציג כל נושא תרגול
    # במקום שבו הוא באמת נלמד ולא כרשימה מנותקת. ה-DB לא מקשר בין PsyItem.topic
    # לקורס, ולכן המיפוי מגיע מטבלה מתוחזקת בראוטר — נושא שלא ממופה (או קורס
    # שעדיין לא נזרע) מחזיר את כל החמישה None, וה-UI נופל לתצוגה הישנה.
    course_id: Optional[int] = None
    course_slug: Optional[str] = None
    course_title: Optional[str] = None
    chapter_number: Optional[int] = None
    chapter_title: Optional[str] = None


class PsyOverview(BaseModel):
    courses: List[PsyCourseCard]
    topics: List[PsyTopicCard]
    simulations: List[PsySimulationOut]
    recent_attempts: List[PsyAttemptSummary]
    weakest_topics: List[PsyTopicStat]
    drill_answered: int
    drill_accuracy: float
    open_attempt: Optional[PsyAttemptSummary] = None
