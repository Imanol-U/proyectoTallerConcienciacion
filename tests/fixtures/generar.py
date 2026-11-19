"""Caras SINTÉTICAS dibujadas (ninguna persona real) para probar el detector."""
from PIL import Image, ImageDraw, ImageFilter
import sys

def face_layer(size, cx, cy, s, skin=(224, 172, 140), hair=(52, 36, 28), shirt=(60, 90, 140)):
    """Devuelve una capa RGBA con una cara de frente. s = semialtura de la cabeza en px."""
    W, H = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    hw, hh = 0.74 * s, s            # semiejes de la cabeza
    dark = tuple(int(c * 0.78) for c in skin)
    darker = tuple(int(c * 0.6) for c in skin)

    # Hombros y cuello
    d.ellipse([cx - 1.9 * s, cy + 1.25 * s, cx + 1.9 * s, cy + 4.2 * s], fill=shirt)
    d.rectangle([cx - 0.34 * s, cy + 0.6 * s, cx + 0.34 * s, cy + 1.5 * s], fill=dark)
    # Orejas
    for sx in (-1, 1):
        d.ellipse([cx + sx * hw - 0.13 * s, cy - 0.18 * s, cx + sx * hw + 0.13 * s, cy + 0.22 * s], fill=dark)
    # Pelo (detrás) y cabeza
    d.ellipse([cx - hw * 1.08, cy - hh * 1.14, cx + hw * 1.08, cy + hh * 0.35], fill=hair)
    d.ellipse([cx - hw, cy - hh, cx + hw, cy + hh], fill=skin)
    # Flequillo
    d.chord([cx - hw * 1.02, cy - hh * 1.08, cx + hw * 1.02, cy - hh * 0.05], 180, 360, fill=hair)
    # Sombra lateral suave
    shade = Image.new("RGBA", size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(shade)
    ds.ellipse([cx + hw * 0.35, cy - hh * 0.7, cx + hw * 1.0, cy + hh * 0.8], fill=dark + (110,))
    ds.ellipse([cx - hw * 0.55, cy + hh * 0.62, cx + hw * 0.55, cy + hh * 1.02], fill=dark + (90,))
    shade = shade.filter(ImageFilter.GaussianBlur(s * 0.12))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse([cx - hw, cy - hh, cx + hw, cy + hh], fill=255)
    layer.paste(shade, (0, 0), Image.composite(shade.split()[3], Image.new("L", size, 0), mask))
    d = ImageDraw.Draw(layer)

    ey = cy - 0.12 * s
    for sx in (-1, 1):
        ex = cx + sx * 0.32 * s
        # Cuenca
        d.ellipse([ex - 0.2 * s, ey - 0.13 * s, ex + 0.2 * s, ey + 0.13 * s], fill=dark)
        # Ojo
        d.ellipse([ex - 0.15 * s, ey - 0.075 * s, ex + 0.15 * s, ey + 0.075 * s], fill=(245, 245, 240))
        d.ellipse([ex - 0.07 * s, ey - 0.07 * s, ex + 0.07 * s, ey + 0.07 * s], fill=(70, 50, 35))
        d.ellipse([ex - 0.03 * s, ey - 0.03 * s, ex + 0.03 * s, ey + 0.03 * s], fill=(10, 10, 10))
        d.ellipse([ex - 0.045 * s, ey - 0.05 * s, ex - 0.015 * s, ey - 0.02 * s], fill=(255, 255, 255))
        # Párpado y ceja
        d.arc([ex - 0.16 * s, ey - 0.1 * s, ex + 0.16 * s, ey + 0.1 * s], 195, 345, fill=darker, width=max(2, int(0.02 * s)))
        d.rounded_rectangle([ex - 0.2 * s, ey - 0.25 * s, ex + 0.2 * s, ey - 0.19 * s], radius=int(0.03 * s), fill=hair)
    # Nariz
    d.polygon([(cx - 0.02 * s, cy - 0.05 * s), (cx - 0.11 * s, cy + 0.3 * s), (cx + 0.11 * s, cy + 0.3 * s)], fill=dark)
    d.ellipse([cx - 0.12 * s, cy + 0.22 * s, cx - 0.02 * s, cy + 0.32 * s], fill=darker)
    d.ellipse([cx + 0.02 * s, cy + 0.22 * s, cx + 0.12 * s, cy + 0.32 * s], fill=darker)
    # Boca
    d.ellipse([cx - 0.26 * s, cy + 0.44 * s, cx + 0.26 * s, cy + 0.6 * s], fill=(170, 80, 80))
    d.line([cx - 0.25 * s, cy + 0.52 * s, cx + 0.25 * s, cy + 0.52 * s], fill=(110, 45, 50), width=max(2, int(0.02 * s)))
    return layer.filter(ImageFilter.GaussianBlur(max(0.6, s * 0.012)))

def background(size, top=(196, 206, 214), bottom=(150, 160, 170)):
    W, H = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(H):
        t = y / max(1, H - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return img

def compose(size, faces, **bg):
    img = background(size, **bg).convert("RGBA")
    for (cx, cy, s, kw) in faces:
        img.alpha_composite(face_layer(size, cx, cy, s, **kw))
    return img.convert("RGB")

def gradient(w, h):
    import numpy as np
    y, x = np.mgrid[0:h, 0:w]
    r = (x * 255 // max(1, w - 1)).astype(np.uint8)
    g = (y * 255 // max(1, h - 1)).astype(np.uint8)
    b = ((x + y) % 256).astype(np.uint8)
    return Image.fromarray(np.dstack([r, g, b]), "RGB")


def exif_bytes(orientation=None):
    exif = Image.Exif()
    exif[0x010F] = "CamaraDePrueba"          # Make
    exif[0x0110] = "Modelo X"                # Model
    exif[0x0132] = "2026:01:02 03:04:05"     # DateTime
    if orientation:
        exif[0x0112] = orientation
    exif[0x8825] = {1: "N", 2: (40.0, 25.0, 0.48), 3: "W", 4: (3.0, 42.0, 13.68)}  # GPS
    return exif.tobytes()


if __name__ == "__main__":
    # Uso: python3 tests/fixtures/generar.py tests/fixtures
    # Regenera las imágenes de prueba. Todas son dibujos o degradados
    # sintéticos: no aparece ninguna persona real.
    from PIL import ImageCms
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    other = dict(skin=(150, 105, 80), hair=(20, 18, 16), shirt=(140, 60, 60))

    # Una cara, ya cuadrada, en los tres formatos admitidos.
    one = compose((512, 512), [(256, 236, 150, {})])
    one.save(f"{out}/cara.png")
    one.save(f"{out}/cara.webp", quality=90)
    one.save(f"{out}/cara.jpg", quality=92)

    # "Foto de móvil": grande, cara descentrada, con EXIF (GPS, fecha, modelo) e ICC.
    phone = compose((1600, 1200), [(980, 520, 230, {})])
    phone.save(f"{out}/cara-exif-gps.jpg", quality=90, exif=exif_bytes(), icc_profile=icc)

    # La misma foto guardada "tumbada" con orientación EXIF 6: solo se ve
    # derecha si el navegador aplica la orientación al abrirla.
    phone.transpose(Image.Transpose.ROTATE_90).save(
        f"{out}/cara-girada-exif.jpg", quality=90, exif=exif_bytes(orientation=6))

    # Dos personas, y un paisaje sin nadie.
    compose((1400, 900), [(430, 430, 200, {}), (980, 450, 200, other)]).save(f"{out}/dos-caras.jpg", quality=90)
    background((1200, 900), top=(120, 170, 220), bottom=(70, 120, 70)).save(f"{out}/sin-cara.jpg", quality=90)

    # Fotograma para la cámara simulada (640x480, cara centrada).
    compose((640, 480), [(320, 222, 138, {})]).save(f"{out}/camara-cara.png")
    compose((640, 480), [(190, 230, 112, {}), (450, 230, 112, other)]).save(f"{out}/camara-dos-caras.png")

    # JPEG progresivo 512x512 con EXIF + XMP + ICC, para las pruebas de lib/jpeg.
    import io
    buf = io.BytesIO()
    gradient(512, 512).save(buf, "JPEG", quality=88, progressive=True, exif=exif_bytes(), icc_profile=icc)
    data = buf.getvalue()
    xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>'
    payload = b"http://ns.adobe.com/xap/1.0/\x00" + xmp
    segment = b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
    open(f"{out}/progresivo-exif-512.jpg", "wb").write(data[:2] + segment + data[2:])
    print("ok")
