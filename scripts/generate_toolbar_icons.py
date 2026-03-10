import base64
import json
import os
from pathlib import Path
from urllib import request, error

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.all"
ICON_DIR = ROOT / "src" / "icons"
MASTER_PATH = ICON_DIR / "icon-master.png"
MODEL = "gemini-2.5-flash-image"


PROMPT = (
    "Design a clean, flat Chrome extension toolbar icon for 'EdgeLang'. "
    "The icon should be a simple, high-contrast symbol that still reads at 16x16. "
    "Show the corner of a document page combined with a subtle language-learning spark or speech cue. "
    "Use a minimal geometric style, centered composition, no words, no letters, no watermark. "
    "Palette: deep navy, teal, and warm amber on a light background. "
    "Make it look like a polished modern product icon, not a detailed illustration."
)


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def generate_image(api_key: str) -> bytes:
    payload = {
        "contents": [{
            "parts": [{"text": PROMPT}]
        }],
        "generationConfig": {
            "responseModalities": ["Image"],
            "imageConfig": {
                "aspectRatio": "1:1"
            }
        }
    }
    req = request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Gemini image request failed: HTTP {exc.code} {body}") from exc

    candidates = data.get("candidates", [])
    for candidate in candidates:
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])

    raise RuntimeError(f"No image bytes returned by Gemini. Response keys: {list(data.keys())}")


def save_icons(image_bytes: bytes) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    with MASTER_PATH.open("wb") as fh:
        fh.write(image_bytes)

    image = Image.open(MASTER_PATH).convert("RGBA")
    sizes = [16, 32, 48, 128]
    for size in sizes:
        output = image.resize((size, size), Image.LANCZOS)
        output.save(ICON_DIR / f"icon-{size}.png")


def main() -> None:
    env = load_env(ENV_PATH)
    api_key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not found in .env.all or environment")
    image_bytes = generate_image(api_key)
    save_icons(image_bytes)
    print(f"Generated toolbar icons in {ICON_DIR}")


if __name__ == "__main__":
    main()
