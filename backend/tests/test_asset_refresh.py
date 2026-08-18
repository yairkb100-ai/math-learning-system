# -*- coding: utf-8 -*-
"""Storage-refresh decisions in seed.ensure_course_assets.

The bug these cover: seed updates FileAsset.size from the git file even on the
code path that never touches object storage (taken whenever R2 is
unconfigured). A row could therefore report the new size while the stored
object still served the old bytes, and the old `exists.size == src_size` check
could not see it — both sides already agreed. 88 regenerated worksheets were
held back that way until 2026-08-18.
"""
import hashlib
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from seed import _content_key, _refresh_key  # noqa: E402


def _write(tmp_path, data):
    p = tmp_path / "asset.pdf"
    p.write_bytes(data)
    return str(p)


def _digest(data):
    return hashlib.sha1(data).hexdigest()[:10]


def test_content_key_encodes_the_files_hash(tmp_path):
    src = _write(tmp_path, b"hello")
    key = _content_key("abc123.pdf", src)
    assert key == f"abc123-{_digest(b'hello')}.pdf"


def test_content_key_does_not_accumulate_digests(tmp_path):
    """A second edit must replace the digest, not append another one."""
    src = _write(tmp_path, b"v2")
    key = _content_key(f"abc123-{_digest(b'v1')}.pdf", src)
    assert key == f"abc123-{_digest(b'v2')}.pdf"
    assert key.count("-") == 1


def test_content_key_is_stable_for_identical_bytes(tmp_path):
    src = _write(tmp_path, b"same")
    once = _content_key("abc123.pdf", src)
    twice = _content_key(once, src)
    assert once == twice, "re-running must not rename an unchanged asset"


def test_no_reupload_when_key_already_matches_content(tmp_path):
    src = _write(tmp_path, b"payload")
    stored = f"abc123-{_digest(b'payload')}.pdf"
    assert _refresh_key(stored, src, row_size=7, src_size=7) is None


def test_reupload_when_row_size_lies_about_the_stored_object(tmp_path):
    """The regression: sizes agree, but the key encodes different bytes.

    This is what a deploy with R2 unconfigured leaves behind — `size` was
    refreshed from git, the object was not.
    """
    src = _write(tmp_path, b"new bytes")
    stored = f"abc123-{_digest(b'old bytes')}.pdf"
    want = _refresh_key(stored, src, row_size=len(b"new bytes"),
                        src_size=len(b"new bytes"))
    assert want == f"abc123-{_digest(b'new bytes')}.pdf"


def test_reupload_when_content_changed(tmp_path):
    src = _write(tmp_path, b"much longer payload")
    stored = f"abc123-{_digest(b'old')}.pdf"
    assert _refresh_key(stored, src, row_size=3, src_size=19) is not None


@pytest.mark.parametrize("row_size,expected_upload", [(4, False), (99, True)])
def test_legacy_key_falls_back_to_the_size_check(tmp_path, row_size,
                                                 expected_upload):
    """A key with no digest encodes nothing about the content.

    Re-uploading every such asset would cost one storage write per file on the
    next deploy, so those keep the cheap size comparison until something else
    forces a refresh.
    """
    src = _write(tmp_path, b"abcd")
    got = _refresh_key("plainuuidkey.pdf", src, row_size=row_size, src_size=4)
    assert (got is not None) is expected_upload


def test_legacy_key_gets_a_content_addressed_name_when_it_does_refresh(tmp_path):
    src = _write(tmp_path, b"abcd")
    got = _refresh_key("plainuuidkey.pdf", src, row_size=1, src_size=4)
    assert got == f"plainuuidkey-{_digest(b'abcd')}.pdf"


def test_extension_is_preserved(tmp_path):
    p = tmp_path / "clip.mp4"
    p.write_bytes(b"video")
    assert _content_key("abc.mp4", str(p)).endswith(".mp4")
