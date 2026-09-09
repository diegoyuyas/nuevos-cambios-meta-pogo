#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_imagenes_webp.py

Convierte public/data/pokemon_images.json (base64, un solo archivo gigante)
en archivos .webp individuales dentro de public/images/, uno por especie.

Por qué: servir 1 JSON de 60+ MB obliga al navegador a descargar y parsear
TODO antes de mostrar un solo ícono, y no se puede cachear por separado.
Con archivos individuales:
  - Cada imagen se cachea sola (en la 2da visita, si no cambió, no se vuelve
    a descargar).
  - Se cargan en paralelo, no en bloque.
  - WebP pesa 25-35% menos que PNG a igual calidad, y ya no hay overhead de
    base64 (+33%).

Este script NO borra pokemon_images.json (por si quieres comparar tamaños o
hacer rollback); solo genera la carpeta public/images/ nueva.

Uso:
    python generar_imagenes_webp.py
"""

import json
import os
import base64
import io
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

INPUT_FILE = "public/data/pokemon_images.json"
OUTPUT_DIR = "public/images"
WEBP_QUALITY = 85  # 80-90 es un buen punto medio calidad/peso para sprites


def main():
    print("== Generador de imágenes WebP individuales ==\n")

    if not os.path.exists(INPUT_FILE):
        print(f"No se encontró {INPUT_FILE}. Corre este script desde la raíz del proyecto.")
        return

    with open(INPUT_FILE, encoding="utf-8") as f:
        images = json.load(f)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total = len(images)
    peso_original = 0
    peso_nuevo = 0
    fallidos = []

    print(f"Total de especies en el JSON: {total}\n")

    for i, (species_id, data_uri) in enumerate(images.items(), 1):
        out_path = os.path.join(OUTPUT_DIR, f"{species_id}.webp")
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            continue  # ya generado en una corrida anterior (reanudable)
        try:
            _, b64data = data_uri.split(",", 1)
            raw = base64.b64decode(b64data)
            peso_original += len(raw)

            img = Image.open(io.BytesIO(raw)).convert("RGBA")
            img.save(out_path, format="WEBP", quality=WEBP_QUALITY, method=6)

            peso_nuevo += os.path.getsize(out_path)

            if i % 100 == 0 or i == total:
                print(f"[{i}/{total}] procesadas...")
        except Exception as e:
            fallidos.append((species_id, str(e)))

    print(f"\nListo. {total - len(fallidos)} imágenes guardadas en {OUTPUT_DIR}/")
    print(f"Peso original (PNG decodificado): {peso_original/1024/1024:.1f} MB")
    print(f"Peso nuevo (WebP en disco):        {peso_nuevo/1024/1024:.1f} MB")
    if peso_original:
        ahorro = (1 - peso_nuevo/peso_original) * 100
        print(f"Ahorro: {ahorro:.0f}%")

    if fallidos:
        print(f"\n{len(fallidos)} especies fallaron:")
        for sid, err in fallidos[:20]:
            print(f"  - {sid}: {err}")


if __name__ == "__main__":
    main()
