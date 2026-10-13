# -*- coding: utf-8 -*-
"""Answer matching: numeric equivalence yes, multiple-choice stays strict.

Runs under pytest and as a plain script (``python tests/test_answers.py``).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.answers import answers_match  # noqa: E402

N = "numeric"
MC = "multiple-choice"

# (user answer, key, question type, expected)
CASES = [
    # exactly what worked before keeps working
    ("42", "42", N, True),
    ("  42 ", "42", N, True),
    ("Yes", "yes", MC, True),
    ("3/4", "3/4", N, True),
    # the complaints: the student was right and was marked wrong
    ("0.50", "0.5", N, True),
    ("0.5", "0.50", N, True),
    ("25%", "25", N, True),
    ("25", "25%", N, True),
    ("70°", "70", N, True),
    ("70 °", "70", N, True),
    ("250 ₪", "250", N, True),
    ("1/2", "0.5", N, True),
    ("0.75", "3/4", N, True),
    ("1,000", "1000", N, True),
    ("0,5", "0.5", N, True),
    ("−3", "-3", N, True),          # unicode minus
    ("(-3)", "-3", N, True),
    ("(−3)", "-3", N, True),
    ("-0.5", "-1/2", N, True),
    ("6.0", "6", N, True),
    # wrong stays wrong
    ("0.51", "0.5", N, False),
    ("25", "250", N, False),
    ("0.25", "25%", N, False),            # percent is not converted to a fraction
    ("3", "-3", N, False),
    ("1/3", "0.33", N, False),
    ("", "5", N, False),
    ("abc", "5", N, False),
    ("1/0", "5", N, False),
    # "simplify" questions: an unreduced fraction is not the answer
    ("6/8", "3/4", N, False),
    ("2/4", "1/2", N, False),
    ("3/4", "3/4", N, True),
    ("0.75", "3/4", N, True),            # a decimal is not an unreduced fraction
    # but an unreduced fraction is fine when the key is a decimal/number
    ("6/8", "0.75", N, True),
    # multiple choice never gets numeric leniency
    ("0.50", "0.5", MC, False),
    ("1/2", "0.5", MC, False),
    ("25%", "25", MC, False),
    ("1/2", "0.5", None, False),
]


def test_cases():
    bad = [c for c in CASES if answers_match(c[0], c[1], c[2]) != c[3]]
    assert not bad, "mismatches: %r" % bad


def test_thousands_separator_is_not_confused_with_a_decimal_comma():
    assert answers_match("1,000", "1000", N)
    assert not answers_match("1,000", "1", N)      # one thousand, not 1.000
    assert answers_match("0,25", "0.25", N)


if __name__ == "__main__":
    test_cases()
    test_thousands_separator_is_not_confused_with_a_decimal_comma()
    print("ALL PASSED (%d cases)" % len(CASES))
