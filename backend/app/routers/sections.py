"""Section (חלק) routes: public listing + admin CRUD."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, models
from app.database import get_db
from app.dependencies import require_admin
from app.schemas import (
    CourseSummary,
    SectionCreate,
    SectionOut,
    SectionUpdate,
    SectionWithCourses,
)

router = APIRouter(prefix="/api", tags=["sections"])


def _course_summary(course: models.Course) -> CourseSummary:
    return CourseSummary(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        language=course.language,
        chapters_count=len(course.chapters),
        estimated_hours=course.estimated_hours,
        slug=course.slug,
        section_id=course.section_id,
    )


def _unique_slug(db: Session, title: str) -> str:
    base = crud.slugify(title)
    slug = base
    n = 2
    while db.query(models.Section).filter(models.Section.slug == slug).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


@router.get("/sections", response_model=list[SectionWithCourses])
def list_sections(db: Session = Depends(get_db)) -> list[SectionWithCourses]:
    sections = (
        db.query(models.Section)
        .order_by(models.Section.order, models.Section.id)
        .all()
    )
    return [
        SectionWithCourses(
            id=s.id,
            title=s.title,
            description=s.description,
            order=s.order,
            slug=s.slug,
            courses=[_course_summary(c) for c in s.courses],
        )
        for s in sections
    ]


@router.post("/admin/sections", response_model=SectionOut, status_code=201)
def create_section(
    payload: SectionCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SectionOut:
    section = models.Section(
        title=payload.title,
        description=payload.description,
        order=payload.order,
        slug=_unique_slug(db, payload.title),
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.put("/admin/sections/{section_id}", response_model=SectionOut)
def update_section(
    section_id: int,
    payload: SectionUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> SectionOut:
    section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="חלק לא נמצא")
    if payload.title is not None:
        section.title = payload.title
    if payload.description is not None:
        section.description = payload.description
    if payload.order is not None:
        section.order = payload.order
    db.commit()
    db.refresh(section)
    return section


@router.delete("/admin/sections/{section_id}", status_code=204)
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
) -> None:
    section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="חלק לא נמצא")
    for course in section.courses:
        course.section_id = None
    db.delete(section)
    db.commit()
