# -*- coding: utf-8 -*-
"""Global content search: find courses and chapters by title/topic.

Public endpoint — it returns only catalog-level information (course titles,
chapter titles, which chapter mentions a topic), never chapter content, so the
subscription gate on content endpoints is not bypassed.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Chapter, Course, Section

router = APIRouter(prefix="/api", tags=["search"])

MAX_RESULTS = 30


class CourseHit(BaseModel):
    id: int
    slug: str | None = None
    title: str
    section: str | None = None
    chapters_count: int


class ChapterHit(BaseModel):
    course_id: int
    course_title: str
    number: int
    title: str
    match: str  # "title" | "content"


class SearchResult(BaseModel):
    query: str
    courses: list[CourseHit]
    chapters: list[ChapterHit]


@router.get("/search", response_model=SearchResult)
def search(
    q: str = Query(..., min_length=2, max_length=80),
    db: Session = Depends(get_db),
) -> SearchResult:
    term = f"%{q.strip()}%"

    course_rows = (
        db.query(Course)
        .filter((Course.title.ilike(term)) | (Course.description.ilike(term)))
        .limit(MAX_RESULTS)
        .all()
    )
    sections = {s.id: s.title for s in db.query(Section).all()}
    courses = [
        CourseHit(
            id=c.id,
            slug=c.slug,
            title=c.title,
            section=sections.get(c.section_id),
            chapters_count=len(c.chapters),
        )
        for c in course_rows
    ]

    # Title matches first (best relevance), then content-only matches — a
    # chapter that merely *mentions* the topic still proves it exists in the
    # lomda. Only titles/numbers are returned, never the content itself.
    title_rows = (
        db.query(Chapter, Course.title)
        .join(Course, Course.id == Chapter.course_id)
        .filter(Chapter.title.ilike(term))
        .order_by(Course.id, Chapter.number)
        .limit(MAX_RESULTS)
        .all()
    )
    seen = {(ch.course_id, ch.number) for ch, _ in title_rows}
    chapters = [
        ChapterHit(
            course_id=ch.course_id,
            course_title=ct,
            number=ch.number,
            title=ch.title,
            match="title",
        )
        for ch, ct in title_rows
    ]

    room = MAX_RESULTS - len(chapters)
    if room > 0:
        content_rows = (
            db.query(Chapter, Course.title)
            .join(Course, Course.id == Chapter.course_id)
            .filter(Chapter.content.ilike(term), ~Chapter.title.ilike(term))
            .order_by(Course.id, Chapter.number)
            .limit(room)
            .all()
        )
        for ch, ct in content_rows:
            if (ch.course_id, ch.number) in seen:
                continue
            chapters.append(
                ChapterHit(
                    course_id=ch.course_id,
                    course_title=ct,
                    number=ch.number,
                    title=ch.title,
                    match="content",
                )
            )

    return SearchResult(query=q, courses=courses, chapters=chapters)
