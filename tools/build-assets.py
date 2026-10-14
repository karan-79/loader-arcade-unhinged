"""Builds the pictures the -img styles show from the plugin's own pixel
sprites: the hero's poses, the vehicles, and the built-in rivals.

    python3 tools/build-content.py
    npx tsx tools/dump-sprites.ts > /tmp/sprites.json
    python3 tools/build-assets.py /tmp/sprites.json

Every character is drawn at 8 picture pixels per sprite pixel, so a picture
fills exactly the cells its sprite would: a rival `w` pixels wide and 8 tall
(legs included) is a (w*8)x64 PNG shown over w columns and 4 rows.

Writes:
  assets/img/hero/<pose>[-flash|-rage][-l].png      the hero's poses; -l faces left
  assets/img/hero/bazooka.png                      the idle pose, bazooka up
  assets/img/vehicles/{tank,chopper}-<n>[-flash].png
  assets/img/rivals/<name>/<frame>[-h1|-h2][-r].png  walk-0, walk-1, hurt, ko;
                                                     -h1/-h2 helmets, -r faces right
"""

import json
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f'{ROOT}/assets/img'
SCALE = 8

OUTLINE = (20, 20, 20, 255)
WHITE = (255, 255, 255, 255)
LEG = (210, 210, 210, 255)
SHOE = (224, 72, 72, 255)
HELMETS = {1: ((91, 107, 58, 255), (143, 160, 96, 255)), 2: ((138, 144, 153, 255), (208, 214, 222, 255))}


def rgba(color):
    return ((color >> 16) & 255, (color >> 8) & 255, color & 255, 255)


def from_pixels(rows, palette, scale=SCALE):
    width = max(len(row) for row in rows)
    im = Image.new('RGBA', (width * scale, len(rows) * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y, row in enumerate(rows):
        for x, pixel in enumerate(row):
            if pixel in palette:
                d.rectangle([x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1], fill=rgba(palette[pixel]))
    return im


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


# Clawd and the vehicles, straight from their pixels.

def build_hero(sprites):
    poses, palette = sprites['hero']['poses'], sprites['hero']['palette']
    looks = {
        '': palette,
        '-flash': {key: 0xFFFFFF for key in palette},
        '-rage': {**palette, 'o': 0xFF4D2E},
    }
    for pose, rows in poses.items():
        for suffix, colors in looks.items():
            im = from_pixels(rows, colors)
            save(im, f'{OUT}/hero/{pose}{suffix}.png')
            save(ImageOps.mirror(im), f'{OUT}/hero/{pose}{suffix}-l.png')

    bazooka = [list(row) for row in poses['idle']]
    for x in range(16):
        bazooka[0][x] = 'z' if 1 < x < 14 else 'Z'
        bazooka[1][x] = 'Z' if x in (0, 15) else 'z'
    save(from_pixels([''.join(row) for row in bazooka], {**palette, 'z': 0x4A5530, 'Z': 0x2E2E2E}), f'{OUT}/hero/bazooka.png')


def build_vehicles(sprites):
    tank = sprites['tank']
    for n, treads in enumerate(tank['treads']):
        rows = list(tank['rows'])
        rows[6] = treads
        save(from_pixels(rows, tank['palette']), f'{OUT}/vehicles/tank-{n}.png')
        save(from_pixels(rows, {**tank['palette'], 'g': 0xFFFFFF, 't': 0xFFFFFF}), f'{OUT}/vehicles/tank-{n}-flash.png')

    chopper = sprites['chopper']
    for n, rotor in enumerate([chopper['rows'][0], chopper['rotorShort']]):
        rows = [rotor, *chopper['rows'][1:], '.' * len(rotor)]
        save(from_pixels(rows, chopper['palette']), f'{OUT}/vehicles/chopper-{n}.png')
        save(from_pixels(rows, {**chopper['palette'], 'c': 0xFFFFFF}), f'{OUT}/vehicles/chopper-{n}-flash.png')


# Rivals: their pixels scaled up, with cartoon eyes and legs.

def logo_picture(rival):
    return from_pixels(rival['sprite'], rival['palette'])


def eyes(d, box, mood):
    left, top, right, bottom = box
    cx, cy = (left + right) / 2, top + (bottom - top) * 0.42
    gap = max(8, (right - left) * 0.18)
    for x in (cx - gap, cx + gap):
        if mood == 'ko':
            d.ellipse([x - 6, cy - 6, x + 6, cy + 6], fill=WHITE)
            d.line([(x - 4, cy - 4), (x + 4, cy + 4)], fill=OUTLINE, width=3)
            d.line([(x - 4, cy + 4), (x + 4, cy - 4)], fill=OUTLINE, width=3)
            continue
        d.ellipse([x - 6, cy - 7, x + 6, cy + 7], fill=WHITE, outline=OUTLINE, width=2)
        if mood == 'hurt':
            d.line([(x - 3, cy - 3), (x + 3, cy + 3)], fill=OUTLINE, width=2)
            d.line([(x - 3, cy + 3), (x + 3, cy - 3)], fill=OUTLINE, width=2)
        else:
            d.ellipse([x - 5, cy - 2, x + 1, cy + 4], fill=OUTLINE)


def legs(d, cx, top, stride):
    for side, swing in ((-1, stride), (1, -stride)):
        hip = cx + side * 7
        foot = hip + swing * 5
        d.line([(hip, top), (foot, top + 9)], fill=LEG, width=4)
        d.ellipse([foot - 7, top + 7, foot + 4, top + 12], fill=SHOE, outline=OUTLINE, width=1)


def helmet(d, box, kind):
    left, top, right, bottom = box
    shell, shine = HELMETS[kind]
    height = (bottom - top) * 0.32
    d.chord([left - 3, top - height, right + 3, top + height], 180, 360, fill=shell, outline=OUTLINE, width=2)
    d.rectangle([left - 5, top - 1, right + 5, top + 3], fill=shell, outline=OUTLINE, width=1)
    d.ellipse([left + 6, top - height * 0.7, left + 12, top - height * 0.4], fill=shine)


def rival_frame(rival, mood, stride, armor):
    width = len(rival['sprite'][0]) * SCALE
    im = Image.new('RGBA', (width, 64), (0, 0, 0, 0))
    logo = logo_picture(rival)
    logo.thumbnail((width - 4, 50), Image.NEAREST)
    left, top = (width - logo.width) // 2, 52 - logo.height
    box = (left, top, left + logo.width, top + logo.height)
    d = ImageDraw.Draw(im)

    if mood == 'walk':
        legs(d, width // 2, 50, stride)
    elif mood == 'hurt':
        legs(d, width // 2, 50, 0)

    im.alpha_composite(logo, (left, top))
    d = ImageDraw.Draw(im)

    # A character drawn with its own eyes (pupils as 'k') keeps them, crossed
    # out when hurt; one without gets cartoon eyes.
    pupils = [(x, y) for y, row in enumerate(rival['sprite']) for x, c in enumerate(row) if c == 'k']
    if pupils:
        if mood != 'walk':
            cell = logo.width / len(rival['sprite'][0])
            for x, y in pupils:
                cx, cy = left + (x + 0.5) * cell, top + (y + 0.5) * cell
                d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=WHITE)
                d.line([(cx - 3, cy - 3), (cx + 3, cy + 3)], fill=OUTLINE, width=2)
                d.line([(cx - 3, cy + 3), (cx + 3, cy - 3)], fill=OUTLINE, width=2)
    else:
        eyes(d, box, mood)

    if armor:
        helmet(d, box, armor)

    return im.rotate(180) if mood == 'ko' else im


def build_rivals(sprites):
    for rival in sprites['rivals']:
        folder = f"{OUT}/rivals/{rival['id']}"
        frames = {'walk-0': ('walk', 1), 'walk-1': ('walk', -1), 'hurt': ('hurt', 0), 'ko': ('ko', 0)}
        for frame, (mood, stride) in frames.items():
            for armor in (0, 1, 2) if mood != 'ko' else (0,):
                im = rival_frame(rival, mood, stride, armor)
                suffix = f'-h{armor}' if armor else ''
                save(im, f'{folder}/{frame}{suffix}.png')
                save(ImageOps.mirror(im), f'{folder}/{frame}{suffix}-r.png')



if __name__ == '__main__':
    sprites = json.load(open(sys.argv[1]))
    shutil.rmtree(OUT, ignore_errors=True)
    build_hero(sprites)
    build_vehicles(sprites)
    build_rivals(sprites)
    count = sum(len(files) for _, _, files in os.walk(OUT))
    print(f'{count} pictures in {OUT}')
