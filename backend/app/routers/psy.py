"""פסיכוטכני routes — item bank drill, timed simulations, score reports.

Design notes worth knowing before editing:

* **The clock is the server's.** ``PsyAttempt.section_started_at`` is the only
  source of truth for how much time is left. The browser is told how many
  seconds remain and counts down from that, but a submission arriving after the
  section deadline is truncated, not honoured. A mock whose timer can be paused
  with devtools is not a mock.
* **The form is frozen at start.** Drawing questions once and storing the refs
  on the attempt means editing the bank mid-attempt cannot change the paper the
  student is sitting.
* **Answers never leave the server before they are due.** The item payload the
  player receives has no ``correct_index`` and no explanation; both appear only
  in the results endpoint after the attempt is finished.
"""

from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, psy_scoring
from app.database import get_db
from app.dependencies import get_current_user, user_content_access
from app.products import PRODUCT_KARNI
from app.settings_store import free_simulations_count
from app.access import TIER_FREE, unlocked_psy_item_ids, unlocked_simulation_ids
from app.schemas_psy import (
    PsyAnswerReview,
    PsyAttemptStart,
    PsyAttemptSummary,
    PsyCourseCard,
    PsyDrillAnswer,
    PsyDrillResult,
    PsyItemOut,
    PsyOverview,
    PsyPassageOut,
    PsyResults,
    PsySectionResult,
    PsySectionState,
    PsySectionSubmit,
    PsySectionSubmitResult,
    PsySimSectionInfo,
    PsySimulationOut,
    PsyTopicCard,
    PsyTopicStat,
)

router = APIRouter(prefix="/api/psy", tags=["psy"])

# Grace given to a submission that lands just after the deadline, to cover
# network latency and the browser's own last-second save. Beyond it the section
# is scored as it stood at the deadline.
SUBMIT_GRACE_SECONDS = 5

# A drill answer this far past the item's target time is flagged as "correct but
# too slow" — on a speeded exam that is a finding, not a pass.
OVER_TIME_FACTOR = 1.5


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _passage_out(passage: Optional[models.PsyPassage]) -> Optional[PsyPassageOut]:
    if passage is None:
        return None
    return PsyPassageOut.model_validate(passage)


def _item_out(item: models.PsyItem) -> PsyItemOut:
    """Student-facing view of an item — deliberately answer-free."""
    return PsyItemOut(
        ref=item.ref,
        domain=item.domain,
        qtype=item.qtype,
        topic=item.topic,
        stem=item.stem,
        figure=item.figure,
        options=list(item.options or []),
        difficulty=item.difficulty,
        target_seconds=item.target_seconds,
        passage=_passage_out(item.passage),
    )


def _items_by_ref(db: Session, refs: List[str]) -> Dict[str, models.PsyItem]:
    if not refs:
        return {}
    rows = db.query(models.PsyItem).filter(models.PsyItem.ref.in_(refs)).all()
    return {row.ref: row for row in rows}


def _draw_section_items(
    db: Session,
    section: models.PsySimSection,
    exclude: Optional[set] = None,
) -> List[str]:
    """Pick the refs for one section: a fixed form if authored, else a draw.

    A blueprint row is ``{count, topic?, qtype?, domain?, difficulty?}``. Rows
    are filled in order and already-picked refs are excluded, so a narrow row
    later in the list cannot silently duplicate an earlier pick.

    ``exclude`` carries the refs already used by *earlier sections of the same
    attempt*. Without it, a two-quantitative-section mock drawn from a thin bank
    can hand the student the same question twice in one sitting.

    Reading-comprehension items are drawn as whole passage clusters: pulling
    three unrelated questions that each reference a text the student never sees
    would be worse than useless.
    """
    if section.item_refs:
        return list(section.item_refs)

    picked: List[str] = []
    seen: set[str] = set(exclude or ())
    blueprint = section.blueprint or [{"count": section.num_questions}]

    for row in blueprint:
        count = int(row.get("count") or 0)
        if count <= 0:
            continue
        q = db.query(models.PsyItem).filter(
            models.PsyItem.is_active.is_(True),
            models.PsyItem.domain == (row.get("domain") or section.domain),
        )
        if row.get("topic"):
            q = q.filter(models.PsyItem.topic == row["topic"])
        if row.get("qtype"):
            q = q.filter(models.PsyItem.qtype == row["qtype"])
        if row.get("difficulty"):
            q = q.filter(models.PsyItem.difficulty == int(row["difficulty"]))
        if seen:
            q = q.filter(~models.PsyItem.ref.in_(seen))

        candidates = q.order_by(func.random()).limit(count * 4).all()

        taken = 0
        deferred: List[models.PsyItem] = []
        for item in candidates:
            if taken >= count or item.ref in seen:
                continue
            if item.passage_id is None:
                picked.append(item.ref)
                seen.add(item.ref)
                taken += 1
                continue
            # Passage item → take the cluster in authored order, but never past
            # the row's count: a cluster is 5 questions, so appending it whole
            # handed a "10 questions" section up to 14 and broke both the card's
            # promise and the clock. A cluster is only worth starting if at
            # least two of its questions fit — reading 200 words for a single
            # question is a bad trade — so with one slot left we defer and try
            # to fill from standalone items first.
            remaining = count - taken
            if remaining < 2:
                deferred.append(item)
                continue
            # The cluster carries the row's own constraints. Pulling it by
            # passage_id alone let a ``difficulty: 2`` row hand back items of
            # difficulty 3 and 4 — the filters applied to the candidate query
            # but not to the members dragged in behind it.
            cluster_q = db.query(models.PsyItem).filter(
                models.PsyItem.passage_id == item.passage_id,
                models.PsyItem.is_active.is_(True),
            )
            if row.get("topic"):
                cluster_q = cluster_q.filter(models.PsyItem.topic == row["topic"])
            if row.get("qtype"):
                cluster_q = cluster_q.filter(models.PsyItem.qtype == row["qtype"])
            if row.get("difficulty"):
                cluster_q = cluster_q.filter(
                    models.PsyItem.difficulty == int(row["difficulty"])
                )
            cluster = cluster_q.order_by(
                models.PsyItem.passage_order, models.PsyItem.id
            ).all()
            # A passage another section already used is not worth reopening:
            # the student would meet the same 200 words twice, a few questions
            # at a time. Leave it and fill from somewhere else.
            if any(m.ref in seen for m in cluster):
                deferred.append(item)
                continue
            for member in cluster:
                if taken >= count:
                    break
                picked.append(member.ref)
                seen.add(member.ref)
                taken += 1

        # Nothing standalone was left to fill the last slot — better a lone
        # passage question than a section that comes up short.
        for item in deferred:
            if taken >= count:
                break
            if item.ref in seen:
                continue
            picked.append(item.ref)
            seen.add(item.ref)
            taken += 1

    return picked


def _seconds_left(attempt: models.PsyAttempt, section: models.PsySimSection) -> int:
    if attempt.section_started_at is None:
        return section.minutes * 60
    elapsed = (datetime.utcnow() - attempt.section_started_at).total_seconds()
    return max(0, int(section.minutes * 60 - elapsed))


def _get_attempt(db: Session, attempt_id: int, user: models.User) -> models.PsyAttempt:
    attempt = (
        db.query(models.PsyAttempt)
        .filter(
            models.PsyAttempt.id == attempt_id,
            models.PsyAttempt.user_id == user.id,
        )
        .first()
    )
    if attempt is None:
        raise HTTPException(status_code=404, detail="הסימולציה לא נמצאה")
    return attempt


def _sim_out(
    db: Session,
    sim: models.PsySimulation,
    user: models.User,
    locked: bool,
) -> PsySimulationOut:
    attempts = (
        db.query(models.PsyAttempt)
        .filter(
            models.PsyAttempt.user_id == user.id,
            models.PsyAttempt.simulation_id == sim.id,
            models.PsyAttempt.status == "completed",
        )
        .all()
    )
    totals = [a.score_percent for a in attempts if a.score_percent is not None]
    return PsySimulationOut(
        slug=sim.slug,
        title=sim.title,
        description=sim.description,
        kind=sim.kind,
        total_minutes=sum(s.minutes for s in sim.sections),
        total_questions=sum(s.num_questions for s in sim.sections),
        sections=[PsySimSectionInfo.model_validate(s) for s in sim.sections],
        locked=locked,
        best_percent=max(totals) if totals else None,
        attempts_count=len(attempts),
    )


def _topic_stats_from_rows(rows: List[dict]) -> List[PsyTopicStat]:
    """Aggregate ``{domain, topic, is_correct, seconds}`` rows by topic."""
    buckets: Dict[tuple, Dict[str, float]] = {}
    for row in rows:
        topic = row.get("topic")
        if not topic:
            continue
        key = (row.get("domain") or "", topic)
        b = buckets.setdefault(key, {"answered": 0, "correct": 0, "seconds": 0})
        b["answered"] += 1
        b["correct"] += 1 if row.get("is_correct") else 0
        b["seconds"] += row.get("seconds") or 0

    stats = [
        PsyTopicStat(
            domain=domain,
            topic=topic,
            answered=int(b["answered"]),
            correct=int(b["correct"]),
            accuracy=round(b["correct"] / b["answered"], 3) if b["answered"] else 0.0,
            avg_seconds=round(b["seconds"] / b["answered"], 1) if b["answered"] else 0.0,
        )
        for (domain, topic), b in buckets.items()
    ]
    stats.sort(key=lambda s: (s.accuracy, -s.answered))
    return stats


# ---------------------------------------------------------------------------
# Simulations — catalog
# ---------------------------------------------------------------------------

@router.get("/simulations", response_model=List[PsySimulationOut])
def list_simulations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[PsySimulationOut]:
    sims = (
        db.query(models.PsySimulation)
        .filter(models.PsySimulation.is_published.is_(True))
        .order_by(models.PsySimulation.order, models.PsySimulation.id)
        .all()
    )
    access = user_content_access(db, current_user, PRODUCT_KARNI)
    open_ids = (
        unlocked_simulation_ids(db, free_simulations_count(db))
        if access.tier == TIER_FREE
        else set()
    )
    return [
        _sim_out(db, sim, current_user,
                 locked=access.tier == TIER_FREE and sim.id not in open_ids)
        for sim in sims
    ]


@router.post("/simulations/{slug}/start", response_model=PsyAttemptStart)
def start_simulation(
    slug: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsyAttemptStart:
    sim = (
        db.query(models.PsySimulation)
        .filter(
            models.PsySimulation.slug == slug,
            models.PsySimulation.is_published.is_(True),
        )
        .first()
    )
    if sim is None:
        raise HTTPException(status_code=404, detail="הסימולציה לא נמצאה")
    access = user_content_access(db, current_user, PRODUCT_KARNI)
    if access.tier == TIER_FREE and sim.id not in unlocked_simulation_ids(
        db, free_simulations_count(db)
    ):
        raise HTTPException(status_code=402, detail="content_locked")
    if not sim.sections:
        raise HTTPException(status_code=409, detail="לסימולציה אין פרקים")

    # One live attempt per student. Resuming beats silently starting a second
    # paper and losing the first — and it stops a refresh from resetting the clock.
    existing = (
        db.query(models.PsyAttempt)
        .filter(
            models.PsyAttempt.user_id == current_user.id,
            models.PsyAttempt.simulation_id == sim.id,
            models.PsyAttempt.status == "in_progress",
        )
        .order_by(models.PsyAttempt.id.desc())
        .first()
    )
    if existing is not None:
        return PsyAttemptStart(
            attempt_id=existing.id, section_index=existing.current_section
        )

    form = []
    used: set = set()
    for section in sim.sections:
        refs = _draw_section_items(db, section, exclude=used)
        used.update(refs)
        form.append(
            {
                "section_index": section.order,
                "domain": section.domain,
                "item_refs": refs,
            }
        )

    attempt = models.PsyAttempt(
        user_id=current_user.id,
        simulation_id=sim.id,
        simulation_title=sim.title,
        status="in_progress",
        current_section=sim.sections[0].order,
        section_started_at=datetime.utcnow(),
        form=form,
        answers={},
        section_results=[],
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return PsyAttemptStart(attempt_id=attempt.id, section_index=attempt.current_section)


# ---------------------------------------------------------------------------
# Simulations — playing
# ---------------------------------------------------------------------------

@router.get("/attempts/{attempt_id}/section", response_model=PsySectionState)
def get_section(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsySectionState:
    attempt = _get_attempt(db, attempt_id, current_user)
    sim = attempt.simulation
    sections = sim.sections
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="הסימולציה כבר הוגשה")

    section = next((s for s in sections if s.order == attempt.current_section), None)
    if section is None:
        raise HTTPException(status_code=409, detail="פרק לא נמצא")

    form_row = next(
        (r for r in (attempt.form or []) if r.get("section_index") == section.order),
        {"item_refs": []},
    )
    refs = list(form_row.get("item_refs") or [])
    by_ref = _items_by_ref(db, refs)
    items = [_item_out(by_ref[r]) for r in refs if r in by_ref]

    saved = {
        ref: rec["chosen"]
        for ref, rec in (attempt.answers or {}).items()
        if ref in by_ref and rec.get("chosen") is not None
    }

    return PsySectionState(
        attempt_id=attempt.id,
        status=attempt.status,
        section_index=section.order,
        sections_total=len(sections),
        domain=section.domain,
        title=section.title,
        minutes=section.minutes,
        seconds_left=_seconds_left(attempt, section),
        items=items,
        saved=saved,
    )


@router.post("/attempts/{attempt_id}/save")
def autosave_section(
    attempt_id: int,
    payload: PsySectionSubmit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> dict:
    """Merge in-progress answers without advancing the section.

    Called periodically by the player so a crashed tab or a dead battery does
    not cost the student the section they were halfway through.
    """
    attempt = _get_attempt(db, attempt_id, current_user)
    if attempt.status != "in_progress":
        return {"saved": False}
    if payload.section_index != attempt.current_section:
        return {"saved": False}

    answers = dict(attempt.answers or {})
    for ref, chosen in payload.answers.items():
        rec = dict(answers.get(ref) or {})
        rec["chosen"] = chosen
        rec["seconds"] = payload.timings.get(ref, rec.get("seconds", 0))
        rec["flagged"] = ref in payload.flagged
        answers[ref] = rec
    attempt.answers = answers
    db.commit()
    return {"saved": True, "seconds_left": _seconds_left(
        attempt,
        next(s for s in attempt.simulation.sections if s.order == attempt.current_section),
    )}


@router.post("/attempts/{attempt_id}/section", response_model=PsySectionSubmitResult)
def submit_section(
    attempt_id: int,
    payload: PsySectionSubmit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsySectionSubmitResult:
    """Score the current section and move on. There is no going back."""
    attempt = _get_attempt(db, attempt_id, current_user)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="הסימולציה כבר הוגשה")

    sections = attempt.simulation.sections
    section = next((s for s in sections if s.order == attempt.current_section), None)
    if section is None:
        raise HTTPException(status_code=409, detail="פרק לא נמצא")
    if payload.section_index != section.order:
        # A stale tab submitting an earlier section must not overwrite the
        # section the student has since moved on to.
        raise HTTPException(status_code=409, detail="הפרק כבר נסגר")

    late = _seconds_left(attempt, section) <= 0 and (
        datetime.utcnow() - (attempt.section_started_at or datetime.utcnow())
    ).total_seconds() > section.minutes * 60 + SUBMIT_GRACE_SECONDS

    form_row = next(
        (r for r in (attempt.form or []) if r.get("section_index") == section.order),
        {"item_refs": []},
    )
    refs = list(form_row.get("item_refs") or [])
    by_ref = _items_by_ref(db, refs)

    answers = dict(attempt.answers or {})
    correct = 0
    unanswered = 0
    seconds_total = 0

    for ref in refs:
        item = by_ref.get(ref)
        if item is None:
            continue
        stored = dict(answers.get(ref) or {})
        # A late submission is scored on what was already autosaved, so running
        # the clock out cannot be used to buy extra thinking time.
        chosen = stored.get("chosen") if late else payload.answers.get(ref, stored.get("chosen"))
        seconds = stored.get("seconds", 0) if late else payload.timings.get(ref, stored.get("seconds", 0))
        is_correct = chosen is not None and int(chosen) == item.correct_index
        if chosen is None:
            unanswered += 1
        if is_correct:
            correct += 1
        seconds_total += int(seconds or 0)
        answers[ref] = {
            "chosen": chosen,
            "correct": is_correct,
            "seconds": int(seconds or 0),
            "flagged": ref in payload.flagged,
        }

    attempt.answers = answers

    results = list(attempt.section_results or [])
    results = [r for r in results if r.get("section_index") != section.order]
    results.append(
        {
            "section_index": section.order,
            "domain": section.domain,
            "title": section.title,
            "correct": correct,
            "total": len(refs),
            "unanswered": unanswered,
            "seconds": seconds_total,
            "is_pilot": bool(section.is_pilot),
        }
    )
    results.sort(key=lambda r: r["section_index"])
    attempt.section_results = results

    following = [s for s in sections if s.order > section.order]
    if following:
        attempt.current_section = following[0].order
        attempt.section_started_at = datetime.utcnow()
        db.commit()
        return PsySectionSubmitResult(
            status="in_progress", next_section=attempt.current_section, attempt_id=attempt.id
        )

    _finalize(db, attempt)
    return PsySectionSubmitResult(status="completed", next_section=None, attempt_id=attempt.id)


def _finalize(db: Session, attempt: models.PsyAttempt) -> None:
    scored = psy_scoring.score_sections(attempt.section_results or [])
    attempt.score_percent = scored["score_percent"]
    attempt.domain_scores = scored["domain_scores"]
    attempt.status = "completed"
    attempt.finished_at = datetime.utcnow()
    db.commit()


@router.post("/attempts/{attempt_id}/finish", response_model=PsySectionSubmitResult)
def finish_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsySectionSubmitResult:
    """Close an attempt early. Sections never reached score as zero."""
    attempt = _get_attempt(db, attempt_id, current_user)
    if attempt.status == "completed":
        return PsySectionSubmitResult(status="completed", next_section=None, attempt_id=attempt.id)

    done = {r["section_index"] for r in (attempt.section_results or [])}
    results = list(attempt.section_results or [])
    for section in attempt.simulation.sections:
        if section.order in done:
            continue
        form_row = next(
            (r for r in (attempt.form or []) if r.get("section_index") == section.order),
            {"item_refs": []},
        )
        refs = list(form_row.get("item_refs") or [])
        # Count what was autosaved before the student walked away — abandoning
        # mid-section should not erase the answers already given.
        correct = sum(
            1
            for ref in refs
            if (attempt.answers or {}).get(ref, {}).get("correct")
        )
        results.append(
            {
                "section_index": section.order,
                "domain": section.domain,
                "title": section.title,
                "correct": correct,
                "total": len(refs),
                "unanswered": len(refs) - correct,
                "seconds": 0,
                "is_pilot": bool(section.is_pilot),
            }
        )
    results.sort(key=lambda r: r["section_index"])
    attempt.section_results = results
    _finalize(db, attempt)
    return PsySectionSubmitResult(status="completed", next_section=None, attempt_id=attempt.id)


# ---------------------------------------------------------------------------
# Simulations — results
# ---------------------------------------------------------------------------

@router.get("/attempts", response_model=List[PsyAttemptSummary])
def list_attempts(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[PsyAttemptSummary]:
    rows = (
        db.query(models.PsyAttempt)
        .filter(models.PsyAttempt.user_id == current_user.id)
        .order_by(models.PsyAttempt.started_at.desc(), models.PsyAttempt.id.desc())
        .limit(limit)
        .all()
    )
    return [_attempt_summary(a) for a in rows]


def _attempt_summary(attempt: models.PsyAttempt) -> PsyAttemptSummary:
    return PsyAttemptSummary(
        attempt_id=attempt.id,
        simulation_slug=attempt.simulation.slug if attempt.simulation else "",
        simulation_title=attempt.simulation_title or "",
        status=attempt.status,
        started_at=attempt.started_at,
        finished_at=attempt.finished_at,
        score_percent=attempt.score_percent,
        domain_scores=attempt.domain_scores or {},
    )


@router.get("/attempts/{attempt_id}/results", response_model=PsyResults)
def get_results(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsyResults:
    attempt = _get_attempt(db, attempt_id, current_user)
    if attempt.status != "completed":
        raise HTTPException(status_code=409, detail="הסימולציה עדיין פתוחה")

    sim = attempt.simulation
    by_order = {s.order: s for s in sim.sections}

    all_refs = [
        ref
        for row in (attempt.form or [])
        for ref in (row.get("item_refs") or [])
    ]
    by_ref = _items_by_ref(db, all_refs)

    review: List[PsyAnswerReview] = []
    stat_rows: List[dict] = []
    for row in attempt.form or []:
        index = row.get("section_index")
        for ref in row.get("item_refs") or []:
            item = by_ref.get(ref)
            if item is None:
                continue
            rec = (attempt.answers or {}).get(ref) or {}
            review.append(
                PsyAnswerReview(
                    ref=ref,
                    section_index=index,
                    domain=item.domain,
                    topic=item.topic,
                    qtype=item.qtype,
                    difficulty=item.difficulty,
                    stem=item.stem,
                    figure=item.figure,
                    options=list(item.options or []),
                    chosen=rec.get("chosen"),
                    correct_index=item.correct_index,
                    is_correct=bool(rec.get("correct")),
                    seconds=int(rec.get("seconds") or 0),
                    target_seconds=item.target_seconds,
                    explanation=item.explanation,
                    solution=item.solution,
                    passage=_passage_out(item.passage),
                )
            )
            stat_rows.append(
                {
                    "domain": item.domain,
                    "topic": item.topic,
                    "is_correct": bool(rec.get("correct")),
                    "seconds": int(rec.get("seconds") or 0),
                }
            )

    sections = [
        PsySectionResult(
            section_index=r["section_index"],
            domain=r["domain"],
            title=r.get("title") or by_order.get(r["section_index"]).title
            if by_order.get(r["section_index"])
            else r["domain"],
            correct=r["correct"],
            total=r["total"],
            unanswered=r.get("unanswered", 0),
            seconds=r.get("seconds", 0),
            is_pilot=bool(r.get("is_pilot")),
        )
        for r in (attempt.section_results or [])
    ]

    history = [
        {
            "attempt_id": a.id,
            "finished_at": a.finished_at.isoformat() if a.finished_at else None,
            "score_percent": a.score_percent,
            "domain_scores": a.domain_scores or {},
            "title": a.simulation_title,
        }
        for a in (
            db.query(models.PsyAttempt)
            .filter(
                models.PsyAttempt.user_id == current_user.id,
                models.PsyAttempt.status == "completed",
                models.PsyAttempt.score_percent.isnot(None),
            )
            .order_by(models.PsyAttempt.finished_at.asc())
            .all()
        )
    ]

    return PsyResults(
        attempt_id=attempt.id,
        simulation_slug=sim.slug if sim else "",
        simulation_title=attempt.simulation_title or "",
        status=attempt.status,
        started_at=attempt.started_at,
        finished_at=attempt.finished_at,
        score_percent=attempt.score_percent,
        domain_scores=attempt.domain_scores or {},
        readiness=psy_scoring.readiness(attempt.score_percent),
        sections=sections,
        topics=_topic_stats_from_rows(stat_rows),
        review=review,
        history=history,
    )


# ---------------------------------------------------------------------------
# Drill — untimed topic practice with immediate feedback
# ---------------------------------------------------------------------------

@router.get("/drill", response_model=List[PsyItemOut])
def drill_questions(
    domain: Optional[str] = Query(None),
    topic: Optional[str] = Query(None),
    qtype: Optional[str] = Query(None),
    difficulty: Optional[int] = Query(None, ge=1, le=5),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[PsyItemOut]:
    q = db.query(models.PsyItem).filter(models.PsyItem.is_active.is_(True))
    if domain:
        q = q.filter(models.PsyItem.domain == domain)
    if topic:
        q = q.filter(models.PsyItem.topic == topic)
    if qtype:
        q = q.filter(models.PsyItem.qtype == qtype)
    if difficulty:
        q = q.filter(models.PsyItem.difficulty == difficulty)

    # הטעימה במאגר נמדדת באותו אחוז שחל על הקורסים (ברירת מחדל 20% למי שקנה
    # רק את הלומדה, 42% למי שאין לו מנוי כלל) ולא בסף קושי קבוע — ראה
    # unlocked_psy_item_ids (ולסימולציות — unlocked_simulation_ids).
    access = user_content_access(db, current_user, PRODUCT_KARNI)
    if access.tier == TIER_FREE:
        q = q.filter(models.PsyItem.id.in_(unlocked_psy_item_ids(db, access.ratio)))

    items = q.order_by(func.random()).limit(limit).all()
    # Keep a passage's questions together. Random order served p5, p2, p4, p6,
    # p4… — the student re-read the same 200-word text from scratch four times
    # in one drill. Standalone items keep their random position; the first time
    # a passage appears fixes where its whole group sits.
    first_seen: Dict[int, int] = {}
    for i, item in enumerate(items):
        if item.passage_id is not None:
            first_seen.setdefault(item.passage_id, i)
    drawn_at = {id(item): i for i, item in enumerate(items)}
    items.sort(
        key=lambda it: (
            first_seen[it.passage_id]
            if it.passage_id is not None
            else drawn_at[id(it)],
            it.passage_order or 0,
        )
    )
    return [_item_out(item) for item in items]


@router.post("/drill/answer", response_model=PsyDrillResult)
def drill_answer(
    payload: PsyDrillAnswer,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsyDrillResult:
    item = db.query(models.PsyItem).filter(models.PsyItem.ref == payload.ref).first()
    if item is None:
        raise HTTPException(status_code=404, detail="השאלה לא נמצאה")
    # Same side door the practice router closes: without this, guessing refs
    # would hand out the locked part of the bank complete with solutions.
    access = user_content_access(db, current_user, PRODUCT_KARNI)
    if access.tier == TIER_FREE and item.id not in unlocked_psy_item_ids(db, access.ratio):
        raise HTTPException(status_code=402, detail="content_locked")

    is_correct = payload.chosen == item.correct_index
    db.add(
        models.PsyDrillAttempt(
            user_id=current_user.id,
            item_id=item.id,
            chosen=payload.chosen,
            is_correct=is_correct,
            seconds=payload.seconds or 0,
            domain=item.domain,
            topic=item.topic,
            difficulty=item.difficulty,
        )
    )
    db.commit()

    return PsyDrillResult(
        is_correct=is_correct,
        correct_index=item.correct_index,
        explanation=item.explanation,
        solution=item.solution,
        target_seconds=item.target_seconds,
        over_time=is_correct
        and (payload.seconds or 0) > item.target_seconds * OVER_TIME_FACTOR,
    )


@router.get("/topics")
def drill_topics(
    domain: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> List[dict]:
    """נושאי המאגר, וכמה שאלות פעילות יש בכל אחד.

    ``open_count`` הוא כמה מהן פתוחות לתלמיד הזה בפועל (``None`` = גישה מלאה).
    בלעדיו הצ'יפ בעמוד התרגול הכריז על המספר המלא בזמן ש-``/drill`` מחזיר רק
    את הפרוסה — התוכן היה חסום כמו שצריך, אבל המספר שיקר.
    """
    access = user_content_access(db, current_user, PRODUCT_KARNI)
    open_ids = (
        unlocked_psy_item_ids(db, access.ratio) if access.tier == TIER_FREE else None
    )
    q = (
        db.query(
            models.PsyItem.domain,
            models.PsyItem.topic,
            func.count(models.PsyItem.id),
        )
        .filter(models.PsyItem.is_active.is_(True), models.PsyItem.topic.isnot(None))
    )
    if domain:
        q = q.filter(models.PsyItem.domain == domain)
    rows = q.group_by(models.PsyItem.domain, models.PsyItem.topic).all()
    open_per_topic: Dict[tuple, int] = {}
    if open_ids is not None:
        oq = db.query(
            models.PsyItem.domain, models.PsyItem.topic, func.count(models.PsyItem.id)
        ).filter(
            models.PsyItem.is_active.is_(True),
            models.PsyItem.topic.isnot(None),
            models.PsyItem.id.in_(open_ids),
        )
        if domain:
            oq = oq.filter(models.PsyItem.domain == domain)
        open_per_topic = {
            (d, t): n
            for d, t, n in oq.group_by(models.PsyItem.domain, models.PsyItem.topic).all()
        }
    return [
        {
            "domain": d,
            "topic": t,
            "count": c,
            "open_count": open_per_topic.get((d, t), 0) if open_ids is not None else None,
        }
        for d, t, c in sorted(rows, key=lambda r: (r[0], r[1]))
    ]


# ---------------------------------------------------------------------------
# Hub
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=PsyOverview)
def overview(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> PsyOverview:
    courses = (
        db.query(models.Course)
        .filter(models.Course.track == "psy")
        .order_by(models.Course.section_id, models.Course.id)
        .all()
    )
    completed_by_course: Dict[int, int] = {}
    if courses:
        rows = (
            db.query(models.Chapter.course_id, func.count(models.ChapterProgress.id))
            .join(models.ChapterProgress, models.ChapterProgress.chapter_id == models.Chapter.id)
            .filter(
                models.ChapterProgress.user_id == current_user.id,
                models.ChapterProgress.completed.is_(True),
                models.Chapter.course_id.in_([c.id for c in courses]),
            )
            .group_by(models.Chapter.course_id)
            .all()
        )
        completed_by_course = {course_id: count for course_id, count in rows}

    course_cards = [
        PsyCourseCard(
            id=c.id,
            slug=c.slug,
            title=c.title,
            description=c.description,
            chapters_count=len(c.chapters),
            completed_chapters=completed_by_course.get(c.id, 0),
            section_title=c.section.title if c.section else None,
        )
        for c in courses
    ]

    karni_access = user_content_access(db, current_user, PRODUCT_KARNI)
    free_tier = karni_access.tier == TIER_FREE
    open_sim_ids = (
        unlocked_simulation_ids(db, free_simulations_count(db)) if free_tier else set()
    )
    sims = (
        db.query(models.PsySimulation)
        .filter(models.PsySimulation.is_published.is_(True))
        .order_by(models.PsySimulation.order, models.PsySimulation.id)
        .all()
    )

    attempts = (
        db.query(models.PsyAttempt)
        .filter(models.PsyAttempt.user_id == current_user.id)
        .order_by(models.PsyAttempt.started_at.desc(), models.PsyAttempt.id.desc())
        .limit(10)
        .all()
    )
    open_attempt = next((a for a in attempts if a.status == "in_progress"), None)

    # Weak-topic signal blends drill history with simulation answers, so a
    # student who only ever sits mocks still gets a study plan.
    stat_rows = [
        {
            "domain": row.domain,
            "topic": row.topic,
            "is_correct": row.is_correct,
            "seconds": row.seconds,
        }
        for row in db.query(models.PsyDrillAttempt)
        .filter(models.PsyDrillAttempt.user_id == current_user.id)
        .all()
    ]
    drill_answered = len(stat_rows)
    drill_correct = sum(1 for r in stat_rows if r["is_correct"])

    finished = [a for a in attempts if a.status == "completed"]
    if finished:
        sim_refs = [
            ref
            for a in finished
            for row in (a.form or [])
            for ref in (row.get("item_refs") or [])
        ]
        by_ref = _items_by_ref(db, list(set(sim_refs)))
        for a in finished:
            for ref, rec in (a.answers or {}).items():
                item = by_ref.get(ref)
                if item is None:
                    continue
                stat_rows.append(
                    {
                        "domain": item.domain,
                        "topic": item.topic,
                        "is_correct": bool(rec.get("correct")),
                        "seconds": int(rec.get("seconds") or 0),
                    }
                )

    weakest = [s for s in _topic_stats_from_rows(stat_rows) if s.answered >= 3][:6]

    # Every topic in the bank, with this student's own history folded in — the
    # hub presents the area as a set of subjects to work through, so it needs
    # the full list and not only the weak ones.
    per_topic: Dict[tuple, Dict[str, int]] = {}
    for row in stat_rows:
        if not row.get("topic"):
            continue
        key = (row.get("domain") or "", row["topic"])
        b = per_topic.setdefault(key, {"answered": 0, "correct": 0})
        b["answered"] += 1
        b["correct"] += 1 if row.get("is_correct") else 0

    bank_rows = (
        db.query(models.PsyItem.domain, models.PsyItem.topic, func.count(models.PsyItem.id))
        .filter(models.PsyItem.is_active.is_(True), models.PsyItem.topic.isnot(None))
        .group_by(models.PsyItem.domain, models.PsyItem.topic)
        .all()
    )
    # בדרגת free הכרטיס חייב להגיד גם כמה שאלות באמת פתוחות: אחרת נושא שכתוב
    # עליו "20 שאלות" מחזיר 4 בתרגול בפועל, וזה נקרא כתקלה ולא כטעימה. הספירה
    # המלאה נשארת מוצגת — היא בדיוק מה שממחיש מה נפתח עם מנוי.
    open_per_topic: Dict[tuple, int] = {}
    if free_tier:
        open_per_topic = {
            (domain, topic): n
            for domain, topic, n in db.query(
                models.PsyItem.domain, models.PsyItem.topic, func.count(models.PsyItem.id)
            )
            .filter(
                models.PsyItem.is_active.is_(True),
                models.PsyItem.topic.isnot(None),
                models.PsyItem.id.in_(unlocked_psy_item_ids(db, karni_access.ratio)),
            )
            .group_by(models.PsyItem.domain, models.PsyItem.topic)
            .all()
        }

    topic_cards = []
    for domain, topic, count in bank_rows:
        seen = per_topic.get((domain, topic), {"answered": 0, "correct": 0})
        topic_cards.append(
            PsyTopicCard(
                domain=domain,
                topic=topic,
                count=count,
                open_count=open_per_topic.get((domain, topic), 0) if free_tier else None,
                answered=seen["answered"],
                accuracy=round(seen["correct"] / seen["answered"], 3)
                if seen["answered"]
                else None,
            )
        )
    # Biggest topics first inside each domain — that ordering doubles as a hint
    # about where the exam actually puts its weight.
    domain_order = {d: i for i, d in enumerate(models.PSY_DOMAINS)}
    topic_cards.sort(key=lambda t: (domain_order.get(t.domain, 99), -t.count, t.topic))

    return PsyOverview(
        courses=course_cards,
        topics=topic_cards,
        simulations=[
            _sim_out(db, sim, current_user,
                     locked=free_tier and sim.id not in open_sim_ids)
            for sim in sims
        ],
        recent_attempts=[_attempt_summary(a) for a in attempts],
        weakest_topics=weakest,
        drill_answered=drill_answered,
        drill_accuracy=round(drill_correct / drill_answered, 3) if drill_answered else 0.0,
        open_attempt=_attempt_summary(open_attempt) if open_attempt else None,
    )
