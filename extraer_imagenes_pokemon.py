#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extraer_imagenes_pokemon.py

Extrae los sprites de TODOS los Pokemon (normales + shadow) que aparecen en
los rankings del proyecto, los convierte a base64 y los guarda directamente
en public/data/pokemon_images.json.

- Fuente principal: img.pokemondb.net (la misma que usa PvPoke)
- Fallback: PokeAPI (GitHub) si pokemondb no tiene el sprite
- Para las variantes "_shadow": compone el icono morado de shadow_icon.json
  en la esquina inferior izquierda del sprite base.
- NO guarda ningun .png/.jpg/.webp en disco: todo se procesa en memoria y
  el resultado final es unicamente el JSON con base64.

Uso:
    python extraer_imagenes_pokemon.py

Requiere:
    pip install pillow
(usa solo librerias estandar + pillow, no requests, para minimizar dependencias)
"""

import json
import base64
import io
import os
import time
import random
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

RANKING_FILES = [
    "public/data/siempre_adelante.json",
    "public/data/caminos_crepusculares.json",
]
SHADOW_ICON_FILE = "public/data/shadow_icon.json"
OUTPUT_FILE = "public/data/pokemon_images.json"
FAILED_LOG = "imagenes_fallidas.txt"

POKEMONDB_URL = "https://img.pokemondb.net/sprites/home/normal/{slug}.png"
POKEAPI_URL = "https://pokeapi.co/api/v2/pokemon/{name}/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}

MAX_WORKERS = 6          # descargas simultaneas (moderado para no saturar)
TIMEOUT = 15             # segundos por request
ICON_TRANSPARENT_THRESHOLD = 235  # blancos >= a esto se vuelven transparentes
ICON_SIZE_RATIO = 0.42   # icono shadow ocupa ~42% del ancho/alto del sprite

# Casos donde el nombre de PvPoke no coincide con el slug de pokemondb / pokeapi.
# Si el script reporta fallos, agrega aqui el mapeo correcto y vuelve a correrlo.
SLUG_OVERRIDES = {
    "mr_mime": "mr-mime",
    "mr_rime": "mr-rime",
    "mime_jr": "mime-jr",
    "ho_oh": "ho-oh",
    "porygon_z": "porygon-z",
    "farfetchd": "farfetchd",
    "farfetchd_galarian": "farfetchd-galar",
    "sirfetchd": "sirfetchd",
    "nidoran_female": "nidoran-f",
    "nidoran_male": "nidoran-m",
    "type_null": "type-null",
    "tapu_koko": "tapu-koko",
    "tapu_lele": "tapu-lele",
    "tapu_bulu": "tapu-bulu",
    "tapu_fini": "tapu-fini",
    "jangmo_o": "jangmo-o",
    "hakamo_o": "hakamo-o",
    "kommo_o": "kommo-o",
    "great_tusk": "great-tusk",
    "wo_chien": "wo-chien",
    "chien_pao": "chien-pao",
    "ting_lu": "ting-lu",
    "chi_yu": "chi-yu",
    "nidoran_m": "nidoran-m",
    "nidoran_f": "nidoran-f",
    # Formas ambiguas: mejor intento, verificar en imagenes_fallidas.txt si no coinciden
    "darmanitan_standard": "darmanitan",
    "darmanitan_galarian_standard": "darmanitan-galar",
    "cherrim_overcast": "cherrim",
}

FORM_SUFFIX_MAP = {
    "alolan": "alola",
    "galarian": "galar",
    "hisuian": "hisui",
    "paldean": "paldea",
}

# ---------------------------------------------------------------------------
# Utilidades de nombres
# ---------------------------------------------------------------------------

def is_shadow(species_id: str) -> bool:
    return species_id.endswith("_shadow")


def base_species(species_id: str) -> str:
    return species_id[:-len("_shadow")] if is_shadow(species_id) else species_id


def build_slug(base_name: str) -> str:
    """Convierte un speciesId base (sin _shadow) al slug usado por pokemondb/pokeapi."""
    if base_name in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[base_name]

    slug = base_name
    for suf, repl in FORM_SUFFIX_MAP.items():
        if slug.endswith("_" + suf):
            slug = slug[: -(len(suf) + 1)] + "-" + repl
            break

    slug = slug.replace("_", "-")
    return slug


# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------

def download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def fetch_sprite_bytes(slug: str):
    """Intenta pokemondb primero, luego PokeAPI. Devuelve bytes PNG o None."""
    # 1) Fuente principal: pokemondb
    try:
        data = download_bytes(POKEMONDB_URL.format(slug=slug))
        if data:
            return data
    except Exception:
        pass

    # 2) Fallback: PokeAPI (devuelve JSON con la URL del sprite "home")
    try:
        meta_raw = download_bytes(POKEAPI_URL.format(name=slug))
        meta = json.loads(meta_raw)
        home_url = (
            meta.get("sprites", {})
            .get("other", {})
            .get("home", {})
            .get("front_default")
        )
        if home_url:
            return download_bytes(home_url)
        # ultimo recurso dentro de pokeapi: official-artwork
        art_url = (
            meta.get("sprites", {})
            .get("other", {})
            .get("official-artwork", {})
            .get("front_default")
        )
        if art_url:
            return download_bytes(art_url)
    except Exception:
        pass

    return None


def fetch_one(base_name: str):
    slug = build_slug(base_name)
    # pequeño jitter para no golpear el servidor todos a la vez
    time.sleep(random.uniform(0.05, 0.25))
    data = fetch_sprite_bytes(slug)
    return base_name, slug, data


# ---------------------------------------------------------------------------
# Composicion de imagenes (en memoria, nunca a disco)
# ---------------------------------------------------------------------------

def load_shadow_icon_rgba(icon_json_path: str) -> Image.Image:
    with open(icon_json_path, encoding="utf-8") as f:
        icon_json = json.load(f)
    _, b64data = icon_json["icon"].split(",", 1)
    raw = base64.b64decode(b64data)
    icon = Image.open(io.BytesIO(raw)).convert("RGBA")

    # El archivo viene como JPEG con fondo blanco solido (sin transparencia real).
    # Convertimos los pixeles casi-blancos en transparentes para poder
    # superponer solo la llama morada.
    pixels = icon.load()
    w, h = icon.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= ICON_TRANSPARENT_THRESHOLD and g >= ICON_TRANSPARENT_THRESHOLD and b >= ICON_TRANSPARENT_THRESHOLD:
                pixels[x, y] = (r, g, b, 0)
    return icon


def composite_shadow(base_png_bytes: bytes, shadow_icon_rgba: Image.Image) -> Image.Image:
    base_img = Image.open(io.BytesIO(base_png_bytes)).convert("RGBA")
    w, h = base_img.size
    icon_size = max(1, int(min(w, h) * ICON_SIZE_RATIO))
    icon_resized = shadow_icon_rgba.resize((icon_size, icon_size), Image.LANCZOS)

    pos_x = 0
    pos_y = max(0, h - icon_size)

    composed = base_img.copy()
    composed.alpha_composite(icon_resized, (pos_x, pos_y))
    return composed


def to_data_uri_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("== Extractor de imagenes Pokemon (normal + shadow) ==\n")

    species_ids = set()
    for rf in RANKING_FILES:
        with open(rf, encoding="utf-8") as f:
            for entry in json.load(f):
                species_ids.add(entry["speciesId"])

    print(f"Total de especies (union de ambos rankings): {len(species_ids)}")

    base_names = sorted({base_species(sid) for sid in species_ids})
    print(f"Sprites base unicos a descargar: {len(base_names)}\n")

    print("Cargando y preparando el icono shadow (quitando fondo blanco)...")
    shadow_icon_rgba = load_shadow_icon_rgba(SHADOW_ICON_FILE)
    print("Icono listo.\n")

    base_cache = {}
    failed_bases = []

    print(f"Descargando sprites base con {MAX_WORKERS} hilos...\n")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_one, name): name for name in base_names}
        done = 0
        for future in as_completed(futures):
            done += 1
            base_name, slug, data = future.result()
            status = "OK" if data else "FALLO"
            print(f"[{done}/{len(base_names)}] {base_name} -> {slug} ... {status}")
            if data:
                base_cache[base_name] = data
            else:
                failed_bases.append(base_name)

    print(f"\nDescargas completas. Exitosas: {len(base_cache)} / Fallidas: {len(failed_bases)}")

    print("\nComponiendo imagenes finales (normal + shadow con icono)...")
    result = {}
    compose_failed = []
    for sid in sorted(species_ids):
        base_name = base_species(sid)
        raw = base_cache.get(base_name)
        if raw is None:
            continue
        try:
            if is_shadow(sid):
                composed = composite_shadow(raw, shadow_icon_rgba)
                result[sid] = to_data_uri_png(composed)
            else:
                img = Image.open(io.BytesIO(raw)).convert("RGBA")
                result[sid] = to_data_uri_png(img)
        except Exception as e:
            print(f"  ! Error procesando {sid}: {e}")
            compose_failed.append(sid)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f)

    print(f"\nListo. {len(result)} / {len(species_ids)} imagenes guardadas en {OUTPUT_FILE}")

    all_failed = sorted(set(failed_bases) | set(compose_failed))
    if all_failed:
        with open(FAILED_LOG, "w", encoding="utf-8") as f:
            f.write("\n".join(all_failed))
        print(
            f"\n{len(all_failed)} especies no se pudieron procesar. "
            f"Revisa '{FAILED_LOG}'.\n"
            "Para corregirlas: agrega el slug correcto en SLUG_OVERRIDES "
            "dentro de este script y vuelve a ejecutarlo (reutiliza lo ya "
            "descargado, solo reintenta lo que falto)."
        )
    else:
        print("\nTodas las especies se procesaron sin errores.")


if __name__ == "__main__":
    main()
