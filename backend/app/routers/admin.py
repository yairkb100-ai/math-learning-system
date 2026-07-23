"""Admin routes: user management and course management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.auth import hash_password
from app.database import get_db
from app.dependencies import require_admin
from app.schemas import (
    AdminUserOut,
    ChapterViewOut,
    EnrollmentCreate,
    EnrollmentOut,
    StudentCourseProgress,
    StudentProgressSummary,
    UserCreate,
    UserUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[AdminUserOut]:
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> AdminUserOut:
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="שם המשתמש כבר קיים")
    user = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        password_plain=payload.password,
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> AdminUserOut:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)
        user.password_plain = payload.password
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
) -> None:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="אי אפשר למחוק את המשתמש שאיתו אתה מחובר")
    if user.role == "admin":
        other_admins = (
            db.query(models.User)
            .filter(models.User.role == "admin", models.User.id != user.id)
            .count()
        )
        if other_admins == 0:
            raise HTTPException(status_code=400, detail="לא ניתן למחוק את המנהל האחרון")

    # Many tables reference users.id without an ON DELETE cascade (create_all
    # never adds one), so a bare db.delete(user) 500s for any user with
    # activity. Clean up dependents explicitly:
    #  - uploaded FILES are content — reassign them to the acting admin so
    #    course materials survive the deletion (never silently dropped).
    #  - the user's message threads are removed with them.
    #  - all purely-personal activity rows are deleted.
    db.query(models.FileAsset).filter(models.FileAsset.uploader_id == user.id).update(
        {models.FileAsset.uploader_id: admin.id}, synchronize_session=False
    )
    db.query(models.Message).filter(
        (models.Message.sender_id == user.id) | (models.Message.recipient_id == user.id)
    ).delete(synchronize_session=False)
    for Model in (
        models.LessonRequest,
        models.UserAchievement,
        models.ExamSubmission,
        models.PracticeAttempt,
        models.Subscription,
        models.ChapterProgress,
        models.UserCourseEnrollment,
        models.ChapterView,
        models.LoginEvent,
        models.UserDevice,
    ):
        db.query(Model).filter(Model.user_id == user.id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()


# ---------------------------------------------------------------------------
# Enrollments
# ---------------------------------------------------------------------------

@router.get("/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[EnrollmentOut]:
    return db.query(models.UserCourseEnrollment).all()


@router.post("/enrollments", response_model=EnrollmentOut, status_code=201)
def enroll_user(
    payload: EnrollmentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> EnrollmentOut:
    existing = (
        db.query(models.UserCourseEnrollment)
        .filter_by(user_id=payload.user_id, course_id=payload.course_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="התלמיד כבר רשום לקורס זה")
    enrollment = models.UserCourseEnrollment(
        user_id=payload.user_id, course_id=payload.course_id
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.delete("/enrollments/{user_id}/{course_id}", status_code=204)
def unenroll_user(
    user_id: int,
    course_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    enrollment = (
        db.query(models.UserCourseEnrollment)
        .filter_by(user_id=user_id, course_id=course_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="רישום לא נמצא")
    db.delete(enrollment)
    db.commit()


# ---------------------------------------------------------------------------
# Student progress overview
# ---------------------------------------------------------------------------

@router.get("/progress", response_model=list[StudentProgressSummary])
def students_progress(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[StudentProgressSummary]:
    """Per-student, per-course completion summary for all students."""
    students = (
        db.query(models.User)
        .filter(models.User.role == "student")
        .order_by(models.User.full_name)
        .all()
    )
    courses = db.query(models.Course).all()
    chapter_to_course = {
        ch.id: course.id for course in courses for ch in course.chapters
    }
    totals = {course.id: len(course.chapters) for course in courses}

    rows = (
        db.query(models.ChapterProgress)
        .filter(models.ChapterProgress.completed.is_(True))
        .all()
    )
    # (user_id, course_id) -> {"count": int, "last": datetime | None}
    done: dict[tuple[int, int], dict] = {}
    for row in rows:
        course_id = chapter_to_course.get(row.chapter_id)
        if course_id is None:
            continue
        entry = done.setdefault((row.user_id, course_id), {"count": 0, "last": None})
        entry["count"] += 1
        if row.completed_at and (entry["last"] is None or row.completed_at > entry["last"]):
            entry["last"] = row.completed_at

    return [
        StudentProgressSummary(
            user_id=s.id,
            username=s.username,
            full_name=s.full_name,
            courses=[
                StudentCourseProgress(
                    course_id=c.id,
                    course_title=c.title,
                    total_chapters=totals[c.id],
                    completed_chapters=done.get((s.id, c.id), {}).get("count", 0),
                    progress_pct=round(
                        done.get((s.id, c.id), {}).get("count", 0) / totals[c.id] * 100, 1
                    )
                    if totals[c.id]
                    else 0.0,
                    last_activity=done.get((s.id, c.id), {}).get("last"),
                )
                for c in courses
            ],
        )
        for s in students
    ]


@router.get("/chapter-views", response_model=list[ChapterViewOut])
def list_chapter_views(
    user_id: int | None = None,
    limit: int = 300,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> list[ChapterViewOut]:
    """Recent chapter opens (who viewed which chapter, when), newest first.
    Pass ``user_id`` to see a single student's viewing history."""
    limit = max(1, min(limit, 2000))
    query = db.query(models.ChapterView).order_by(
        models.ChapterView.created_at.desc()
    )
    if user_id is not None:
        query = query.filter(models.ChapterView.user_id == user_id)
    events = query.limit(limit).all()

    out = []
    for e in events:
        u = e.user
        ch = e.chapter
        course = ch.course if ch else None
        out.append(
            ChapterViewOut(
                id=e.id,
                user_id=e.user_id,
                user_name=u.full_name if u else None,
                username=u.username if u else None,
                chapter_id=e.chapter_id,
                chapter_number=ch.number if ch else None,
                chapter_title=ch.title if ch else None,
                course_id=course.id if course else None,
                course_title=course.title if course else None,
                created_at=e.created_at,
            )
        )
    return out


@router.delete("/chapter-views/{view_id}", status_code=204)
def delete_chapter_view(
    view_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    """Delete a single chapter-view log entry."""
    row = db.get(models.ChapterView, view_id)
    if row is not None:
        db.delete(row)
        db.commit()


@router.delete("/chapter-views", status_code=204)
def clear_chapter_views(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    """Clear chapter-view logs. Pass ``user_id`` to clear one student's history;
    omit it to clear the whole log."""
    query = db.query(models.ChapterView)
    if user_id is not None:
        query = query.filter(models.ChapterView.user_id == user_id)
    query.delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# Courses (admin delete)
# ---------------------------------------------------------------------------

@router.delete("/courses/{course_id}", status_code=204)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="קורס לא נמצא")
    db.delete(course)
    db.commit()
