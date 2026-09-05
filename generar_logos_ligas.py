#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_logos_ligas.py

Genera insignias (logos) PROPIAS y originales para cada liga/copa (no usa
artwork de Niantic/PvPoke, todo se dibuja con Pillow) y las guarda en
base64 dentro de public/data/logos/league_logos.json.

Para agregar una nueva liga o copa en el futuro, solo agrega una entrada
al diccionario LIGAS de abajo y vuelve a correr el script; se conservan
las que ya existen.

Uso:
    python generar_logos_ligas.py

Requiere:
    pip install pillow
"""

import json
import base64
import io
import os

from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

OUTPUT_FILE = "public/data/logos/league_logos.json"
SIZE = 128  # px, cuadrado, luego se muestra pequeño en la UI

# key -> (color principal, color secundario/anillo, letra a mostrar)
LIGAS = {
    "super":  ("#2563eb", "#1d4ed8", "S"),
    "ultra":  ("#eab308", "#ca8a04", "U"),
    "master": ("#7c3aed", "#6d28d9", "M"),
}


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def draw_badge(color_hex, ring_hex, letter):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 4
    color = hex_to_rgb(color_hex)
    ring = hex_to_rgb(ring_hex)

    # anillo exterior
    d.ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=ring + (255,))
    # circulo interior (relleno principal)
    inner_pad = pad + 8
    d.ellipse([inner_pad, inner_pad, SIZE - inner_pad, SIZE - inner_pad], fill=color + (255,))

    # linea estilo "pokeball" horizontal
    mid = SIZE // 2
    band_h = 6
    d.rectangle([inner_pad, mid - band_h // 2, SIZE - inner_pad, mid + band_h // 2], fill=(255, 255, 255, 230))

    # circulo central blanco pequeño
    r = 14
    d.ellipse([mid - r, mid - r, mid + r, mid + r], fill=(255, 255, 255, 240))
    d.ellipse([mid - r + 4, mid - r + 4, mid + r - 4, mid + r - 4], fill=color + (255,))

    # letra de la liga en la parte superior del circulo
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
    except Exception:
        font = ImageFont.load_default()

    text = letter
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = mid - tw / 2 - bbox[0]
    ty = inner_pad + 6 - bbox[1]
    d.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))

    return img


def to_data_uri_png(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def main():
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    result = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            try:
                result = json.load(f)
            except Exception:
                result = {}

    for key, (color_hex, ring_hex, letter) in LIGAS.items():
        img = draw_badge(color_hex, ring_hex, letter)
        result[key] = to_data_uri_png(img)
        print(f"Generado logo para '{key}'")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f)

    print(f"\nListo. {len(result)} logo(s) guardados en {OUTPUT_FILE}")
    print("Para agregar una nueva liga/copa: agrega una entrada al diccionario LIGAS y vuelve a correr este script.")


if __name__ == "__main__":
    main()
