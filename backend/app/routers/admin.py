"""Admin routes: user management and course management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.auth import hash_password
from app.database import get_db
from app.dependencies import require_admin
from app.schemas import (
    AdminUserOut,
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
    _: models.User = Depends(require_admin),
) -> None:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
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
