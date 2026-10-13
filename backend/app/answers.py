"""Answer comparison shared by the practice and exam endpoints.

Until now an answer was right only if its text matched the key after
``strip().casefold()``. For a numeric question that marks "0.50" wrong when the
key is "0.5", "25%" wrong when the key is "25", and "1/2" wrong when the key is
"0.5" — the student was right and the app said they were not.

``answers_match`` keeps the strict comparison for everything except questions of
type ``numeric``, where two answers are equal if they are the same NUMBER. The
one thing it will not forgive: a fraction that is not in lowest terms when the
key is itself a fraction ("6/8" for "3/4") — those questions ask the student to
simplify, and accepting 6/8 would hide exactly the mistake being practised.
"""

import re
from fractions import Fraction
from math import gcd
from typing import Optional

# Unicode minus, en dash and the Hebrew maqaf all appear where "-" was meant.
_MINUS = str.maketrans({"−": "-", "–": "-", "—": "-", "־": "-"})
# Decorations that do not change the value: %, degrees, shekel signs.
_UNITS = re.compile(r"(?:%|°|₪|ש\"ח|ש״ח)\s*$")
_FRACTION = re.compile(r"^(-?\d+)\s*/\s*(\d+)$")
_THOUSANDS = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")
_DECIMAL_COMMA = re.compile(r"^-?\d+,\d{1,2}$")
_PLAIN = re.compile(r"^-?\d+(\.\d+)?$")


def normalize(value) -> str:
    """The strict form: trimmed and case-folded."""
    return str(value if value is not None else "").strip().casefold()


def _clean(text: str) -> str:
    text = str(text if text is not None else "").strip().translate(_MINUS)
    text = _UNITS.sub("", text).strip()
    # "(−3)" is how negative numbers are written in the lessons.
    if text.startswith("(") and text.endswith(")"):
        text = text[1:-1].strip()
    return text


def _parse(text: str) -> Optional[Fraction]:
    """The number a string stands for, or None if it is not a plain number."""
    s = _clean(text)
    if not s:
        return None
    m = _FRACTION.match(s)
    if m:
        den = int(m.group(2))
        return Fraction(int(m.group(1)), den) if den else None
    if _THOUSANDS.match(s):
        s = s.replace(",", "")
    elif _DECIMAL_COMMA.match(s):
        s = s.replace(",", ".")
    if _PLAIN.match(s):
        return Fraction(s)
    return None


def _is_unreduced_fraction(text: str) -> bool:
    m = _FRACTION.match(_clean(text))
    if not m:
        return False
    num, den = int(m.group(1)), int(m.group(2))
    return den != 0 and gcd(abs(num), den) > 1


def answers_match(user_answer, correct_answer, question_type: Optional[str] = None) -> bool:
    """True if ``user_answer`` is a correct answer to a question keyed ``correct_answer``."""
    if normalize(user_answer) == normalize(correct_answer):
        return True
    if question_type != "numeric":
        return False
    user, key = _parse(user_answer), _parse(correct_answer)
    if user is None or key is None or user != key:
        return False
    # The key is a fraction ("simplify" questions): an unreduced fraction is not the answer.
    if _FRACTION.match(_clean(correct_answer)) and _is_unreduced_fraction(user_answer):
        return False
    return True
