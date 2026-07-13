#!/usr/bin/env python3
"""Gera os data packs offline do Word Lens usando apenas a biblioteca padrao."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
import time
import urllib.error
import urllib.request
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK = ROOT / "data-sources" / "word-lens" / "sources.lock.json"
DEFAULT_OUTPUT = ROOT / "public" / "word-lens"
LEVEL_ORDER = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
POS_GROUPS = {
    "noun": "noun",
    "verb": "verb",
    "do-verb": "verb",
    "have-verb": "verb",
    "be-verb": "verb",
    "adjective": "adj",
    "adverb": "adv",
}
WORDNET_POS = ("noun", "verb", "adj", "adv")


class PipelineError(RuntimeError):
    pass


@dataclass(frozen=True)
class Source:
    id: str
    kind: str
    name: str
    version: str
    url: str
    sha256: str
    license: str
    license_url: str
    attribution: str

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "Source":
        required = (
            "id", "kind", "name", "version", "url", "sha256",
            "license", "licenseUrl", "attribution",
        )
        missing = [key for key in required if not value.get(key)]
        if missing:
            raise PipelineError(f"Fonte sem campos obrigatorios: {', '.join(missing)}")
        checksum = str(value["sha256"]).lower()
        if len(checksum) != 64 or any(char not in "0123456789abcdef" for char in checksum):
            raise PipelineError(f"SHA-256 invalido para {value['id']}")
        return cls(
            id=str(value["id"]), kind=str(value["kind"]), name=str(value["name"]),
            version=str(value["version"]), url=str(value["url"]), sha256=checksum,
            license=str(value["license"]), license_url=str(value["licenseUrl"]),
            attribution=str(value["attribution"]),
        )


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_word(value: str) -> str:
    return " ".join(value.strip().replace("’", "'").casefold().split())


def load_lock(path: Path) -> tuple[dict[str, Any], list[Source]]:
    try:
        lock = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PipelineError(f"Nao foi possivel ler {path}: {error}") from error
    if lock.get("schemaVersion") != 1 or not lock.get("packVersion") or not lock.get("snapshotDate"):
        raise PipelineError("sources.lock.json possui schema ou metadados invalidos")
    sources = [Source.from_dict(item) for item in lock.get("sources", [])]
    if len(sources) < 3 or len({source.id for source in sources}) != len(sources):
        raise PipelineError("sources.lock.json precisa de fontes unicas CEFR-J, Octanove e WordNet")
    return lock, sources


def download_source(source: Source, cache_dir: Path | None, offline: bool) -> bytes:
    cache_path = cache_dir / f"{source.id}.source" if cache_dir else None
    if cache_path and cache_path.exists():
        cached = cache_path.read_bytes()
        if sha256(cached) == source.sha256:
            return cached
        if offline:
            raise PipelineError(f"Cache com checksum invalido: {cache_path}")
    if offline:
        raise PipelineError(f"Fonte ausente no cache offline: {source.id}")
    last_error: BaseException | None = None
    data: bytes | None = None
    for attempt in range(1, 4):
        try:
            request = urllib.request.Request(source.url, headers={"User-Agent": "NeoReader-WordLens-Builder/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
            break
        except (OSError, urllib.error.URLError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(attempt)
    if data is None:
        raise PipelineError(f"Falha ao baixar {source.id} apos 3 tentativas: {last_error}") from last_error
    actual = sha256(data)
    if actual != source.sha256:
        raise PipelineError(f"Checksum divergente para {source.id}: esperado {source.sha256}, recebido {actual}")
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(data)
    return data


def parse_cefr_csv(data: bytes, source_id: str) -> list[dict[str, str]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise PipelineError(f"CSV {source_id} nao esta em UTF-8") from error
    reader = csv.DictReader(io.StringIO(text))
    required = {"headword", "pos", "CEFR"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise PipelineError(f"CSV {source_id} sem colunas obrigatorias {sorted(required)}")
    rows: list[dict[str, str]] = []
    for number, row in enumerate(reader, start=2):
        word = normalize_word(row.get("headword", ""))
        level = row.get("CEFR", "").strip().upper()
        pos = row.get("pos", "").strip().lower()
        if not word:
            raise PipelineError(f"CSV {source_id}, linha {number}: headword vazio")
        if level not in LEVEL_ORDER:
            raise PipelineError(f"CSV {source_id}, linha {number}: nivel invalido {level!r}")
        rows.append({"word": word, "level": level, "pos": pos, "source": source_id})
    return rows


def resolve_levels(rows: Iterable[dict[str, str]]) -> tuple[dict[str, int], dict[str, set[str]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    word_pos: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        grouped[row["word"]].append(row)
        group = POS_GROUPS.get(row["pos"])
        if group:
            word_pos[row["word"]].add(group)
    levels: dict[str, int] = {}
    conflicts: list[dict[str, Any]] = []
    for word in sorted(grouped):
        candidates = grouped[word]
        numeric_levels = sorted({LEVEL_ORDER[row["level"]] for row in candidates})
        levels[word] = numeric_levels[0]
        if len(numeric_levels) > 1:
            conflicts.append({
                "word": word,
                "resolvedLevel": numeric_levels[0],
                "candidates": sorted(
                    ({"level": LEVEL_ORDER[row["level"]], "pos": row["pos"], "source": row["source"]} for row in candidates),
                    key=lambda value: (value["level"], value["pos"], value["source"]),
                ),
            })
    return levels, word_pos, conflicts


def parse_wordnet_exceptions(data: bytes, levels: dict[str, int], word_pos: dict[str, set[str]]) -> tuple[dict[str, set[str]], dict[str, dict[str, set[str]]]]:
    surface_to_lemmas: dict[str, set[str]] = defaultdict(set)
    lemma_exceptions: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise PipelineError("Arquivo Open English WordNet nao e um ZIP valido") from error
    with archive:
        names = set(archive.namelist())
        for pos in WORDNET_POS:
            suffix = f"/{pos}.exc"
            matches = sorted(name for name in names if name.endswith(suffix))
            if len(matches) != 1:
                raise PipelineError(f"WordNet deve conter exatamente um arquivo {pos}.exc")
            for number, line in enumerate(archive.read(matches[0]).decode("utf-8").splitlines(), start=1):
                parts = [normalize_word(part.replace("_", " ")) for part in line.split()]
                if len(parts) < 2:
                    raise PipelineError(f"WordNet {pos}.exc linha {number} invalida")
                surface = parts[0]
                for lemma in parts[1:]:
                    if lemma in levels and (not word_pos[lemma] or pos in word_pos[lemma]):
                        surface_to_lemmas[surface].add(lemma)
                        lemma_exceptions[lemma][pos].add(surface)
    return surface_to_lemmas, lemma_exceptions


def regular_forms(lemma: str, pos: str, exception_surfaces: set[str]) -> set[str]:
    if " " in lemma or not lemma.isascii() or not lemma.replace("'", "").isalpha():
        return set()
    forms: set[str] = set()
    vowels = set("aeiou")
    if pos == "noun":
        if not exception_surfaces:
            if lemma.endswith("y") and len(lemma) > 1 and lemma[-2] not in vowels:
                forms.add(lemma[:-1] + "ies")
            elif lemma.endswith(("s", "x", "z", "ch", "sh")):
                forms.add(lemma + "es")
            else:
                forms.add(lemma + "s")
    elif pos == "verb":
        if lemma.endswith("y") and len(lemma) > 1 and lemma[-2] not in vowels:
            forms.add(lemma[:-1] + "ies")
        elif lemma.endswith(("s", "x", "z", "ch", "sh", "o")):
            forms.add(lemma + "es")
        else:
            forms.add(lemma + "s")
        if lemma.endswith(("ee", "ye", "oe")):
            if not exception_surfaces:
                forms.add(lemma + "d")
            if not any(surface.endswith("ing") for surface in exception_surfaces):
                forms.add(lemma + "ing")
        elif lemma.endswith("e"):
            if not exception_surfaces:
                forms.add(lemma + "d")
            if not any(surface.endswith("ing") for surface in exception_surfaces):
                forms.add(lemma[:-1] + "ing")
        elif lemma.endswith("y") and len(lemma) > 1 and lemma[-2] not in vowels:
            if not exception_surfaces:
                forms.add(lemma[:-1] + "ied")
            if not any(surface.endswith("ing") for surface in exception_surfaces):
                forms.add(lemma + "ing")
        else:
            if not exception_surfaces:
                forms.add(lemma + "ed")
            if not any(surface.endswith("ing") for surface in exception_surfaces):
                forms.add(lemma + "ing")
    return {form for form in forms if form != lemma}


def build_lemma_map(levels: dict[str, int], word_pos: dict[str, set[str]], exception_forms: dict[str, set[str]], lemma_exceptions: dict[str, dict[str, set[str]]]) -> tuple[dict[str, str], list[dict[str, Any]]]:
    candidates: dict[str, set[str]] = defaultdict(set)
    for surface, lemmas in exception_forms.items():
        candidates[surface].update(lemmas)
    for lemma in sorted(levels):
        for pos in sorted(word_pos.get(lemma, set())):
            exception_surfaces = lemma_exceptions.get(lemma, {}).get(pos, set())
            for surface in regular_forms(lemma, pos, exception_surfaces):
                candidates[surface].add(lemma)
    mapping: dict[str, str] = {}
    collisions: list[dict[str, Any]] = []
    for surface in sorted(candidates):
        lemmas = sorted(candidates[surface])
        if surface in levels:
            continue
        if len(lemmas) == 1:
            mapping[surface] = lemmas[0]
        else:
            collisions.append({"surface": surface, "lemmas": lemmas})
    return mapping, collisions


def build_artifacts(lock: dict[str, Any], sources: list[Source], payloads: dict[str, bytes]) -> dict[str, bytes]:
    cefr_rows: list[dict[str, str]] = []
    wordnet_source: Source | None = None
    for source in sources:
        if source.kind == "cefr":
            cefr_rows.extend(parse_cefr_csv(payloads[source.id], source.id))
        elif source.kind == "morphology":
            wordnet_source = source
    if wordnet_source is None:
        raise PipelineError("Fonte de morfologia WordNet ausente")
    levels, word_pos, conflicts = resolve_levels(cefr_rows)
    exceptions, lemma_exceptions = parse_wordnet_exceptions(payloads[wordnet_source.id], levels, word_pos)
    lemmas, collisions = build_lemma_map(levels, word_pos, exceptions, lemma_exceptions)
    level_counts = Counter(levels.values())
    source_manifest = [
        {
            "id": source.id, "name": source.name, "version": source.version,
            "sha256": source.sha256, "license": source.license,
            "licenseUrl": source.license_url, "attribution": source.attribution,
        }
        for source in sources
    ]
    manifest = {
        "schemaVersion": 1,
        "packVersion": lock["packVersion"],
        "snapshotDate": lock["snapshotDate"],
        "levelsPath": "levels.json",
        "lemmasPath": "lemmas.json",
        "dictionaryPath": None,
        "counts": {
            "headwords": len(levels), "inflectedForms": len(lemmas),
            "cefrConflicts": len(conflicts), "morphologyCollisionsExcluded": len(collisions),
            "byLevel": {str(level): level_counts[level] for level in range(1, 7)},
        },
        "sources": source_manifest,
    }
    report = {
        "schemaVersion": 1,
        "resolution": "lowest CEFR level per normalized headword",
        "morphology": "WordNet exceptions plus forward regular forms; collisions excluded",
        "counts": manifest["counts"],
        "cefrConflicts": conflicts,
        "morphologyCollisions": collisions,
    }
    return {
        "manifest.json": canonical_json(manifest),
        "levels.json": canonical_json(levels),
        "lemmas.json": canonical_json(lemmas),
        "report.json": canonical_json(report),
    }


def write_artifacts(output: Path, artifacts: dict[str, bytes]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    expected = set(artifacts)
    for path in output.iterdir():
        if path.is_file() and path.name not in expected:
            path.unlink()
    for name, data in artifacts.items():
        (output / name).write_bytes(data)


def check_artifacts(output: Path, artifacts: dict[str, bytes]) -> None:
    differences: list[str] = []
    for name, expected in artifacts.items():
        path = output / name
        if not path.exists():
            differences.append(f"ausente: {path}")
        elif path.read_bytes() != expected:
            differences.append(f"desatualizado: {path}")
    if differences:
        raise PipelineError("Data pack divergente; rode npm run word-lens:build\n" + "\n".join(differences))


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "check"))
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--offline", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        lock, sources = load_lock(args.lock)
        payloads = {source.id: download_source(source, args.cache_dir, args.offline) for source in sources}
        artifacts = build_artifacts(lock, sources, payloads)
        if args.command == "build":
            write_artifacts(args.output, artifacts)
            print(f"Word Lens: {len(artifacts)} artefatos gerados em {args.output}")
        else:
            check_artifacts(args.output, artifacts)
            print("Word Lens: data pack atualizado e reproduzivel")
        return 0
    except PipelineError as error:
        print(f"Word Lens: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
