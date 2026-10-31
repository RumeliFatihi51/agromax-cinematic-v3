"""Build standalone logo lockups with outlined Manrope lettering (no font dependency)."""
from pathlib import Path
from math import ceil
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

root = Path(__file__).resolve().parents[1]
font_path = root / 'public/fonts/Manrope-Variable.ttf'
fonts = {weight: instantiateVariableFont(TTFont(font_path), {'wght': weight}) for weight in (500, 800)}
scale = 44 / fonts[500]['head'].unitsPerEm
for light in (False, True):
    icon = (root / f'public/brand/agromax-mark{"-light" if light else ""}-v1.svg').read_text(encoding='utf-8')
    content = icon[icon.index('>')+1:icon.rindex('</svg>')]
    x, paths = 79.0, []
    fill = '#F2F8E9' if light else '#254D36'
    for index, char in enumerate('agromax'):
        font = fonts[500 if index < 4 else 800]
        glyph_name = font.getBestCmap()[ord(char)]
        glyphs = font.getGlyphSet()
        pen = SVGPathPen(glyphs)
        glyphs[glyph_name].draw(pen)
        paths.append(f'<path d="{pen.getCommands()}" transform="translate({x:.3f} 43) scale({scale:.7f} {-scale:.7f})" fill="{fill}"/>')
        x += font['hmtx'][glyph_name][0] * scale - 2.2
    x += 4
    dot = '#D3EE96' if light else '#A1BD61'
    paths.append(f'<circle cx="{x:.3f}" cy="40.2" r="2.8" fill="{dot}"/>')
    width = ceil(x+7)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="64" viewBox="0 0 {width} 64" role="img" aria-label="Agromax">{content}{"".join(paths)}</svg>'
    output = root / f'public/brand/agromax-logo{"-light" if light else ""}-v1.svg'
    output.write_text(svg, encoding='utf-8')
    print(output.name, f'{width} x 64')
