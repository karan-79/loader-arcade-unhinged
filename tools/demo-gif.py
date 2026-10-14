"""Draws the frames tools/demo-frames.ts writes the way a terminal would (block
characters as blocks, everything else in a monospace font), under a spinner
line like Claude Code's, and writes the README's GIF.

    npx tsx tools/demo-frames.ts /tmp/frames.json
    python3 tools/demo-gif.py /tmp/frames.json assets/demo.gif FONT BOLD_FONT

FONT and BOLD_FONT are monospace font files, e.g. JetBrains Mono's.
"""

import base64
import json
import struct
import sys

from PIL import Image, ImageDraw, ImageFont

CELL_WIDTH, CELL_HEIGHT = 8, 16
PAD = 12
FRAME_MS = 66

BACKGROUND = (35, 38, 41)
ORANGE = (215, 119, 87)
DIM = (130, 135, 140)
RULE = (70, 74, 78)

# Quadrant glyphs by which quarters are foreground: 1 top left, 2 top right,
# 4 bottom left, 8 bottom right.
QUADRANTS = [0x20, 0x2598, 0x259D, 0x2580, 0x2596, 0x258C, 0x259E, 0x259B,
             0x2597, 0x259A, 0x2590, 0x259C, 0x2584, 0x2599, 0x259F, 0x2588]
MASKS = {glyph: mask for mask, glyph in enumerate(QUADRANTS)}
SHADES = {0x2591: 0.3, 0x2592: 0.55}


def rgb(color):
    if color & 0x01000000:
        return BACKGROUND
    return ((color >> 16) & 255, (color >> 8) & 255, color & 255)


def draw_cell(d, font, x, y, glyph, fg, bg):
    if glyph in MASKS:
        half_w, half_h = CELL_WIDTH // 2, CELL_HEIGHT // 2
        for quarter, (dx, dy) in ((1, (0, 0)), (2, (1, 0)), (4, (0, 1)), (8, (1, 1))):
            left, top = x + dx * half_w, y + dy * half_h
            d.rectangle([left, top, left + half_w - 1, top + half_h - 1], fill=fg if MASKS[glyph] & quarter else bg)
    elif glyph in SHADES:
        amount = SHADES[glyph]
        d.rectangle([x, y, x + CELL_WIDTH - 1, y + CELL_HEIGHT - 1],
                    fill=tuple(int(bg[i] * (1 - amount) + fg[i] * amount) for i in range(3)))
    else:
        d.rectangle([x, y, x + CELL_WIDTH - 1, y + CELL_HEIGHT - 1], fill=bg)
        d.text((x, y + 1), chr(glyph), font=font, fill=fg)


def draw_frame(frame, index, columns, rows, font, bold):
    width = columns * CELL_WIDTH + PAD * 2
    height = (rows + 3) * CELL_HEIGHT + PAD * 2
    im = Image.new('RGB', (width, height), BACKGROUND)
    d = ImageDraw.Draw(im)

    seconds = index * FRAME_MS // 1000 + 3
    d.text((PAD, PAD), '*', font=bold, fill=ORANGE)
    d.text((PAD + 2 * CELL_WIDTH, PAD), f"{frame['word']}… ({seconds}s · esc to interrupt)", font=font, fill=ORANGE)

    top = PAD + CELL_HEIGHT + 4 + (rows - frame['rows']) * CELL_HEIGHT
    cells = base64.b64decode(frame['cells'])
    for at in range(len(cells) // 12):
        glyph, fg, bg = struct.unpack_from('<III', cells, at * 12)
        x = PAD + (at % columns) * CELL_WIDTH
        y = top + (at // columns) * CELL_HEIGHT
        draw_cell(d, bold, x, y, glyph, rgb(fg), rgb(bg))

    rule = top + frame['rows'] * CELL_HEIGHT + 6
    d.line([(PAD, rule), (width - PAD, rule)], fill=RULE)
    d.text((PAD, rule + 4), '❯', font=font, fill=DIM)
    return im


def main(frames_path, out, font_path, bold_path):
    data = json.load(open(frames_path))
    font = ImageFont.truetype(font_path, 13)
    bold = ImageFont.truetype(bold_path, 13)
    columns = data['columns']
    rows = max(frame['rows'] for frame in data['frames'])
    images = [draw_frame(frame, index, columns, rows, font, bold) for index, frame in enumerate(data['frames'])]

    # One palette for every frame, from a sample across them, so nothing flickers.
    step = max(1, len(images) // 12)
    sample = Image.new('RGB', (images[0].width, images[0].height * 12))
    for slot, index in enumerate(range(0, len(images), step)[:12]):
        sample.paste(images[index], (0, slot * images[0].height))
    palette = sample.quantize(colors=255, method=Image.Quantize.MEDIANCUT)

    frames = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    print(f'{len(frames)} frames, {images[0].width}x{images[0].height}, written to {out}')


if __name__ == '__main__':
    main(*sys.argv[1:5])
