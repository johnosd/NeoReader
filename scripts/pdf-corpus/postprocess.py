"""Pós-processamento do corpus PDF (metadados, merge, senha, cópias).

Chamado por generate-corpus.mjs. Usa só `pypdf` — ferramenta de dev local,
não é dependência do app.
"""
import argparse
import re
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject


def cmd_meta(args):
    reader = PdfReader(args.src)
    writer = PdfWriter(clone_from=reader)
    meta = {}
    if args.title:
        meta["/Title"] = args.title
    if args.author:
        meta["/Author"] = args.author
    if meta:
        writer.add_metadata(meta)
    if args.lang:
        writer._root_object[NameObject("/Lang")] = TextStringObject(args.lang)
    writer.write(args.dst)


def cmd_strip(args):
    # PDF sem nenhum metadado: testa o fallback para o nome do arquivo.
    reader = PdfReader(args.src)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.metadata = None
    writer._info = None  # remove o dicionário /Info que o pypdf cria por padrão
    writer.write(args.dst)


def cmd_merge(args):
    # `parts` no formato arquivo[:inicio-fim] (índices 1-based, inclusivos).
    writer = PdfWriter()
    for part in args.parts:
        # Regex em vez de split(":") — caminhos Windows já têm ":" (C:\...).
        m = re.match(r"^(.*):(\d+)-(\d+)$", part)
        path = m.group(1) if m else part
        reader = PdfReader(path)
        if m:
            pages = range(int(m.group(2)) - 1, int(m.group(3)))
        else:
            pages = range(len(reader.pages))
        for i in pages:
            writer.add_page(reader.pages[i])
    writer.write(args.dst)


def cmd_repeat(args):
    writer = PdfWriter()
    reader = PdfReader(args.src)
    for _ in range(args.times):
        for page in reader.pages:
            writer.add_page(page)
    writer.add_metadata({"/Title": args.title or "Grande"})
    writer.write(args.dst)


def cmd_encrypt(args):
    reader = PdfReader(args.src)
    writer = PdfWriter(clone_from=reader)
    writer.encrypt(user_password=args.password, algorithm="RC4-128")
    writer.write(args.dst)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("meta")
    m.add_argument("src")
    m.add_argument("dst")
    m.add_argument("--title")
    m.add_argument("--author")
    m.add_argument("--lang")
    m.set_defaults(fn=cmd_meta)

    s = sub.add_parser("strip")
    s.add_argument("src")
    s.add_argument("dst")
    s.set_defaults(fn=cmd_strip)

    g = sub.add_parser("merge")
    g.add_argument("dst")
    g.add_argument("parts", nargs="+")
    g.set_defaults(fn=cmd_merge)

    r = sub.add_parser("repeat")
    r.add_argument("src")
    r.add_argument("dst")
    r.add_argument("--times", type=int, required=True)
    r.add_argument("--title")
    r.set_defaults(fn=cmd_repeat)

    e = sub.add_parser("encrypt")
    e.add_argument("src")
    e.add_argument("dst")
    e.add_argument("--password", required=True)
    e.set_defaults(fn=cmd_encrypt)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
