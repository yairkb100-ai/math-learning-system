# -*- coding: utf-8 -*-
"""חשבון בדיקה שמדמה תלמיד שרכש מוצר אחד בלבד — המצב שבו הטעימה הצולבת נראית.

הצורך: ההתנסות פותחת את שני המוצרים ב-100%, ותלמיד שההתנסות שלו נגמרה בלי
רכישה חסום לגמרי. כלומר המצב היחיד שבו ``cross_product_free_pct`` בא לידי
ביטוי — מנוי פעיל על מוצר אחד וטעימה בשני — לא קיים באף חשבון עד המכירה
הראשונה, ואי אפשר לראות אותו בעין. הסקריפט הזה מייצר בדיוק אותו, בלי לגעת
בחשבון של תלמיד אמיתי.

מריצים דרך ``.github/workflows/test-account.yml`` (workflow_dispatch), שמזרים
את ``DATABASE_URL`` של הפרודקשן מאותו secret ש-``seed.py`` כבר משתמש בו.

אידמפוטנטי: הרצה חוזרת על אותו שם משתמש מסנכרנת את המנויים למצב המבוקש
במקום ליצור כפילות, כך שאפשר להחליף ``--product`` הלוך ושוב על אותו חשבון.

``--delete USERNAME`` מוחק חשבון בדיקה על כל שורות ה-FK שלו (אותה רשימה
ש-``admin.delete_user`` מנקה), כדי שאפשר יהיה לנקות חשבון QA שנוצר לאימות
בפרודקשן בלי גישת אדמין. מסרב למחוק חשבון ``role='admin'``, ואידמפוטנטי —
שם שלא קיים יוצא בהצלחה.
"""

import argparse
import os
import secrets
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from app import models  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.products import ALL_PRODUCTS  # noqa: E402

# תוכנית ייעודית לחשבונות הבדיקה, כדי שהם לא יזוהו כמכירה אמיתית בשום דוח
# ולא ייספרו כהמרה של "חבר מביא חבר" (assign_subscription מזכה מפנה; כאן
# הכתיבה ישירה למסד ולכן זה ממילא לא נורה, והתוכנית הנפרדת שומרת על זה מפורש).
TEST_PLAN_CODE = "qa-test"
TEST_PLAN_NAME = "בדיקה פנימית (לא למכירה)"


# שורות ה-FK שמצביעות על ``users.id`` בלי ``ON DELETE CASCADE`` — אותה רשימה
# ש-``admin.delete_user`` מנקה לפני ``db.delete(user)``. חשבון בדיקה לא מעלה
# קבצים ולא שולח הודעות, אבל שומרים את הרשימה מלאה כדי שהמחיקה תישאר נכונה
# גם אם חשבון כזה כן צבר פעילות.
def _delete_test_account(db, username: str) -> int:
    user = db.query(models.User).filter_by(username=username).first()
    if user is None:
        print(f"  user      : {username} — לא קיים, אין מה למחוק")
        return 0
    if user.role == "admin":
        print(f"  ! {username} הוא admin — מסרב למחוק")
        return 1

    # admin.delete_user reassigns uploads to the acting admin because they are
    # course content; a QA account's uploads are test junk, and uploader_id is
    # NOT NULL, so here they are just removed.
    db.query(models.FileAsset).filter(
        models.FileAsset.uploader_id == user.id
    ).delete(synchronize_session=False)
    db.query(models.Message).filter(
        (models.Message.sender_id == user.id) | (models.Message.recipient_id == user.id)
    ).delete(synchronize_session=False)
    db.query(models.Referral).filter(
        (models.Referral.referrer_id == user.id)
        | (models.Referral.referred_user_id == user.id)
    ).delete(synchronize_session=False)
    for Model in (
        models.LessonRequest,
        models.UserAchievement,
        models.ExamSubmission,
        models.PracticeAttempt,
        models.PsyAttempt,
        models.PsyDrillAttempt,
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
    print(f"  user      : {username} (id {user.id}) — נמחק על כל שורות ה-FK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", default="bodek-karni")
    ap.add_argument("--product", choices=list(ALL_PRODUCTS), default="lomda",
                    help="המוצר שיישאר פעיל; בשני התלמיד יראה את הטעימה")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--delete", metavar="USERNAME",
                    help="מוחק את חשבון הבדיקה הזה במקום ליצור/לסנכרן")
    args = ap.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if args.delete:
        return _delete_test_account(db, args.delete)

    other = [p for p in ALL_PRODUCTS if p != args.product]
    now = datetime.utcnow()

    plan = db.query(models.SubscriptionPlan).filter_by(code=TEST_PLAN_CODE).first()
    if plan is None:
        # is_active=False — התוכנית לא מופיעה במסך הרכישה לתלמידים.
        plan = models.SubscriptionPlan(code=TEST_PLAN_CODE, name=TEST_PLAN_NAME,
                                       price_nis=0, duration_days=args.days,
                                       is_active=False, products=args.product)
        db.add(plan)
        db.flush()

    user = db.query(models.User).filter_by(username=args.username).first()
    created = user is None
    password = None
    if created:
        # סיסמה אקראית ולא קבועה בקוד. היא לא מודפסת ללוג של Actions —
        # המנהל קורא אותה במסך ניהול המשתמשים, ששם ממילא מוצג password_plain.
        password = secrets.token_urlsafe(9)
        user = models.User(username=args.username, password_hash=hash_password(password),
                           password_plain=password, full_name=f"בדיקה — {args.username}",
                           role="student", is_active=True)
        db.add(user)
        db.flush()

    # סנכרון המנויים למצב המבוקש: המוצר הנבחר פעיל, השני מבוטל. ביטול ולא
    # מחיקה — זו בדיוק הצורה שבה מנוי שפג נראה במסד, ולכן הבדיקה נאמנה למציאות.
    rows = {s.product: s for s in db.query(models.Subscription).filter_by(user_id=user.id)}
    keep = rows.get(args.product)
    if keep is None:
        db.add(models.Subscription(user_id=user.id, plan_code=TEST_PLAN_CODE,
                                   product=args.product, status="active",
                                   started_at=now, expires_at=now + timedelta(days=args.days)))
    else:
        keep.plan_code = TEST_PLAN_CODE
        keep.status = "active"
        keep.expires_at = now + timedelta(days=args.days)
    for p in other:
        if p in rows:
            rows[p].status = "canceled"

    db.commit()

    print(f"  user      : {args.username} ({'נוצר' if created else 'קיים — מנויים סונכרנו'})")
    print(f"  פעיל      : {args.product}")
    print(f"  טעימה     : {', '.join(other)}")
    if created:
        print("  סיסמה     : אקראית — קרא אותה במסך ניהול המשתמשים באתר")
    else:
        print("  סיסמה     : ללא שינוי")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
