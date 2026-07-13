import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "build_word_lens.py"
SPEC = importlib.util.spec_from_file_location("build_word_lens", SCRIPT)
assert SPEC and SPEC.loader
builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = builder
SPEC.loader.exec_module(builder)


def csv_bytes(rows: list[str]) -> bytes:
    return ("headword,pos,CEFR\n" + "\n".join(rows) + "\n").encode()


def wordnet_zip(files: dict[str, str] | None = None) -> bytes:
    stream = io.BytesIO()
    values = {pos: "" for pos in builder.WORDNET_POS}
    values.update(files or {})
    with zipfile.ZipFile(stream, "w") as archive:
        for pos, content in values.items():
            archive.writestr(f"oewn/{pos}.exc", content)
    return stream.getvalue()


class WordLensBuilderTests(unittest.TestCase):
    def test_normalize_word_handles_case_spaces_and_apostrophes(self):
        self.assertEqual(builder.normalize_word("  We’RE  "), "we're")

    def test_parse_rejects_missing_columns_and_invalid_level(self):
        with self.assertRaises(builder.PipelineError):
            builder.parse_cefr_csv(b"word,level\nhello,A1\n", "fixture")
        with self.assertRaises(builder.PipelineError):
            builder.parse_cefr_csv(csv_bytes(["hello,noun,Z9"]), "fixture")

    def test_levels_resolve_to_lowest_and_report_conflict(self):
        rows = builder.parse_cefr_csv(csv_bytes(["Access,noun,B1", "access,verb,B2"]), "fixture")
        levels, positions, conflicts = builder.resolve_levels(rows)
        self.assertEqual(levels, {"access": 3})
        self.assertEqual(positions["access"], {"noun", "verb"})
        self.assertEqual(len(conflicts), 1)

    def test_morphology_uses_exceptions_and_excludes_collisions(self):
        levels = {"say": 1, "node": 2, "nod": 3, "box": 2}
        positions = {"say": {"verb"}, "node": {"noun"}, "nod": {"verb"}, "box": {"noun"}}
        exceptions, lemma_exceptions = builder.parse_wordnet_exceptions(
            wordnet_zip({"verb": "said say\nstopped stop\nstopping stop\n"}), levels | {"stop": 2}, positions | {"stop": {"verb"}},
        )
        mapping, collisions = builder.build_lemma_map(levels | {"stop": 2}, positions | {"stop": {"verb"}}, exceptions, lemma_exceptions)
        self.assertEqual(mapping["said"], "say")
        self.assertEqual(mapping["nodes"], "node")
        self.assertEqual(mapping["boxes"], "box")
        self.assertEqual(mapping["stopping"], "stop")
        self.assertNotIn("stoping", mapping)
        self.assertEqual(mapping["saying"], "say")
        self.assertNotIn("nods", {item["surface"] for item in collisions})

        mapping, collisions = builder.build_lemma_map(
            {"try": 2, "trie": 3}, {"try": {"verb"}, "trie": {"noun"}}, {}, {},
        )
        self.assertNotIn("tries", mapping)
        self.assertEqual(collisions, [{"surface": "tries", "lemmas": ["trie", "try"]}])

    def test_checksum_fails_closed_in_offline_cache(self):
        data = b"expected"
        source = builder.Source(
            id="fixture", kind="cefr", name="Fixture", version="1", url="https://invalid.invalid",
            sha256=hashlib.sha256(data).hexdigest(), license="test", license_url="https://invalid.invalid",
            attribution="Fixture",
        )
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            (cache / "fixture.source").write_bytes(b"wrong")
            with self.assertRaises(builder.PipelineError):
                builder.download_source(source, cache, offline=True)

    def test_artifacts_are_deterministic_and_check_detects_diff(self):
        lock = {"schemaVersion": 1, "packVersion": "test", "snapshotDate": "2026-07-13"}
        cefr_a = csv_bytes(["access,noun,B1", "access,verb,B2", "box,noun,A2"])
        cefr_b = csv_bytes(["aberration,noun,C2"])
        wn = wordnet_zip({"noun": "boxes box\n"})
        sources = [
            builder.Source("a", "cefr", "A", "1", "u", "0" * 64, "l", "lu", "a"),
            builder.Source("b", "cefr", "B", "1", "u", "1" * 64, "l", "lu", "b"),
            builder.Source("wn", "morphology", "WN", "1", "u", "2" * 64, "l", "lu", "wn"),
        ]
        first = builder.build_artifacts(lock, sources, {"a": cefr_a, "b": cefr_b, "wn": wn})
        second = builder.build_artifacts(lock, sources, {"a": cefr_a, "b": cefr_b, "wn": wn})
        self.assertEqual(first, second)
        manifest = json.loads(first["manifest.json"])
        self.assertEqual(manifest["counts"]["headwords"], 3)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            builder.write_artifacts(output, first)
            builder.check_artifacts(output, second)
            (output / "levels.json").write_text("{}")
            with self.assertRaises(builder.PipelineError):
                builder.check_artifacts(output, second)


if __name__ == "__main__":
    unittest.main()
