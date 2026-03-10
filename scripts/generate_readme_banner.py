import base64
import json
import os
from pathlib import Path
from urllib import request, error

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.all"
OUTPUT_PATH = ROOT / "docs" / "assets" / "banner.png"
MODEL = "gemini-2.5-flash-image"

PROMPT = (
    "Create a polished wide hero banner for an AI browser extension called EdgeLang. "
    "Show an elegant editorial web page transforming into language-learning overlays with subtle highlighted words, "
    "floating translation cards, and a sense of guided reading flow. "
    "Style: modern product illustration, crisp shapes, soft depth, cinematic but clean, highly legible, no tiny UI clutter. "
    "Palette: coral red highlights, deep navy, warm cream, teal accents. "
    "Do not include readable text or logos inside the image. Leave some calm negative space for a README title overlay."
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
                "aspectRatio": "16:9"
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
        raise RuntimeError(f"Gemini banner request failed: HTTP {exc.code} {body}") from exc

    candidates = data.get("candidates", [])
    for candidate in candidates:
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])

    raise RuntimeError(f"No image bytes returned by Gemini. Response keys: {list(data.keys())}")


def save_banner(image_bytes: bytes) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = OUTPUT_PATH.with_suffix(".raw.png")
    with temp_path.open("wb") as fh:
        fh.write(image_bytes)

    image = Image.open(temp_path).convert("RGBA")
    image = image.resize((1600, 900), Image.LANCZOS)
    image.save(OUTPUT_PATH)
    temp_path.unlink(missing_ok=True)


def main() -> None:
    env = load_env(ENV_PATH)
    api_key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not found in .env.all or environment")
    image_bytes = generate_image(api_key)
    save_banner(image_bytes)
    print(f"Generated README banner at {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
