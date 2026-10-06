# Gera um EPUB de layout fixo (rendition:layout = pre-paginated) sintético para testar o caminho do
# foliate-fxl no EpubViewer — o corpus de debug não tem nenhum (feature 022, patch de descarte de páginas).
# Uso: python -I scripts/verificacao-visual/gerar-epub-fxl.py debug-books/fxl/layout-fixo.epub [paginas]
import sys
import zipfile

out = sys.argv[1]
pages = int(sys.argv[2]) if len(sys.argv) > 2 else 24
W, H = 600, 800

container = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

items = "\n".join(f'    <item id="p{i}" href="p{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1, pages + 1))
spine = "\n".join(f'    <itemref idref="p{i}"/>' for i in range(1, pages + 1))
opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:neoreader-fxl-sintetico</dc:identifier>
    <dc:title>Layout Fixo Sintético</dc:title>
    <dc:creator>NeoReader Corpus</dc:creator>
    <dc:language>pt-BR</dc:language>
    <meta property="dcterms:modified">2026-10-06T00:00:00Z</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:spread">none</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
{items}
  </manifest>
  <spine>
{spine}
  </spine>
</package>"""

nav_items = "\n".join(f'      <li><a href="p{i}.xhtml">Página {i}</a></li>' for i in range(1, pages + 1))
nav = f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head>
<body><nav epub:type="toc"><ol>
{nav_items}
</ol></nav></body></html>"""


def page(i: int) -> str:
    hue = (i * 37) % 360
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Página {i}</title>
<meta name="viewport" content="width={W}, height={H}"/>
<style>
  html, body {{ margin: 0; width: {W}px; height: {H}px; background: #fff; }}
  .faixa {{ height: 160px; background: hsl({hue}, 70%, 45%); }}
  h1 {{ font: bold 64px serif; margin: 40px; color: #111; }}
  p {{ font: 28px/1.4 serif; margin: 0 40px; color: #222; }}
</style></head>
<body><div class="faixa"></div><h1>Página {i}</h1>
<p>Livro de layout fixo sintético. Cada página tem o tamanho exato de {W}×{H} e um texto que permite tocar numa palavra.</p>
</body></html>"""


with zipfile.ZipFile(out, "w") as z:
    # mimetype primeiro e sem compressão (exigência do EPUB)
    z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
    z.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
    for i in range(1, pages + 1):
        z.writestr(f"OEBPS/p{i}.xhtml", page(i), compress_type=zipfile.ZIP_DEFLATED)
print(f"{out}: {pages} páginas")
