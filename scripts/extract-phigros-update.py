from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import sys
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import UnityPy
except ImportError:  # pragma: no cover - this is an operator setup error.
    UnityPy = None


PROJECT_ROOT = Path.cwd()
DEFAULT_APK_DIR = Path(r"D:\Files\曲绘\Phigros\APK")
DEFAULT_OUTPUT_PARENT = Path(r"D:\Files\曲绘\Phigros")
WORK_DIR = PROJECT_ROOT / ".phigros-apk-work"

APK_RE = re.compile(r"^Phigros_(\d+(?:\.\d+)*)\.apk$", re.IGNORECASE)
BUNDLE_PREFIX = "assets/aa/Android/"
BUNDLE_RE = re.compile(r"^assets/aa/Android/[0-9a-f]{32}\.bundle$", re.IGNORECASE)
TRACK_ILLUSTRATION_RE = re.compile(r"^Assets/Tracks/(.+)/Illustration\.jpg$")
AVATAR_RE = re.compile(r"^avatar\.(.+)$")
UNSAFE_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


@dataclass(frozen=True)
class ApkSource:
    path: Path
    version: str


@dataclass
class ExportedImage:
    bundle: str
    object_name: str
    width: int
    height: int
    category: str
    output_path: Path
    name_source: str
    source_key: str | None = None


def main() -> int:
    args = parse_args()
    if UnityPy is None:
        print("extract-phigros-update: Python package UnityPy is required. Install with: pip install UnityPy texture2ddecoder", file=sys.stderr)
        return 1

    apk_dir = Path(args.apk_dir)
    output_parent = Path(args.output_parent)
    new_apk, old_apk = resolve_apks(apk_dir, args.new, args.old)
    output_dir = Path(args.out) if args.out else output_parent / version_dir_name(new_apk.version)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"extract-phigros-update: new={new_apk.path}")
    print(f"extract-phigros-update: old={old_apk.path}")
    print(f"extract-phigros-update: output={output_dir}")

    new_catalog = read_catalog(new_apk.path)
    old_catalog = read_catalog(old_apk.path)
    new_keys = parse_catalog_keys(new_catalog)
    old_key_set = set(parse_catalog_keys(old_catalog))
    added_keys = [key for key in new_keys if key not in old_key_set]
    illustration_keys = sorted({key for key in added_keys if TRACK_ILLUSTRATION_RE.match(key)})
    avatar_keys = sorted({key for key in added_keys if AVATAR_RE.match(key)})

    new_bundles = bundle_entries(new_apk.path)
    old_bundles = bundle_entries(old_apk.path)
    added_bundles = sorted(entry for entry in new_bundles if entry not in old_bundles)
    if not added_bundles:
        print("extract-phigros-update: no new bundle files found.")

    with tempfile.TemporaryDirectory(
        prefix="phigros-bundles-",
        dir=WORK_DIR if ensure_work_dir() else None,
        ignore_cleanup_errors=True,
    ) as temp_name:
        temp_dir = Path(temp_name)
        extract_entries(new_apk.path, added_bundles, temp_dir)
        exports = export_images(temp_dir, added_bundles, output_dir, illustration_keys, avatar_keys)

    report = build_report(new_apk, old_apk, output_dir, added_keys, added_bundles, illustration_keys, avatar_keys, exports)
    report_path = output_dir / "phigros-update-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        "extract-phigros-update: "
        f"bundles={len(added_bundles)}, illustrations={sum(1 for item in exports if item.category == '曲绘')}, "
        f"avatars={sum(1 for item in exports if item.category == '头像')}, report={report_path}"
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract new Phigros illustration and avatar images by comparing the newest APK against the previous APK.",
    )
    parser.add_argument("--apk-dir", default=str(DEFAULT_APK_DIR), help="Directory containing Phigros_*.apk files.")
    parser.add_argument("--new", help="New APK path or version, for example 3.19.2.")
    parser.add_argument("--old", help="Old APK path or version, for example 3.19.1.1.")
    parser.add_argument("--output-parent", default=str(DEFAULT_OUTPUT_PARENT), help="Parent directory for version output folders.")
    parser.add_argument("--out", help="Explicit output directory. Defaults to <output-parent>/<new version with dots replaced by underscores>.")
    return parser.parse_args()


def resolve_apks(apk_dir: Path, new_arg: str | None, old_arg: str | None) -> tuple[ApkSource, ApkSource]:
    sources = sorted(discover_apks(apk_dir), key=lambda source: version_key(source.version))
    if not sources:
        raise FileNotFoundError(f"No Phigros_*.apk files found in {apk_dir}")

    new_apk = resolve_apk_arg(apk_dir, sources, new_arg) if new_arg else sources[-1]
    if old_arg:
        old_apk = resolve_apk_arg(apk_dir, sources, old_arg)
    else:
        older = [source for source in sources if version_key(source.version) < version_key(new_apk.version)]
        if not older:
            raise ValueError(f"No older APK found before {new_apk.version}")
        old_apk = older[-1]

    if new_apk.path == old_apk.path:
        raise ValueError("New and old APK must be different.")
    return new_apk, old_apk


def discover_apks(apk_dir: Path) -> list[ApkSource]:
    sources: list[ApkSource] = []
    for file_path in apk_dir.glob("Phigros_*.apk"):
        match = APK_RE.match(file_path.name)
        if match:
            sources.append(ApkSource(path=file_path, version=match.group(1)))
    return sources


def resolve_apk_arg(apk_dir: Path, sources: list[ApkSource], value: str) -> ApkSource:
    candidate = Path(value)
    if candidate.exists():
        match = APK_RE.match(candidate.name)
        version = match.group(1) if match else candidate.stem
        return ApkSource(path=candidate, version=version)

    for source in sources:
        if source.version == value:
            return source

    version_path = apk_dir / f"Phigros_{value}.apk"
    if version_path.exists():
        return ApkSource(path=version_path, version=value)
    raise FileNotFoundError(f"Could not resolve APK: {value}")


def version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def version_dir_name(version: str) -> str:
    return version.replace(".", "_")


def ensure_work_dir() -> bool:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    return True


def read_catalog(apk_path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(apk_path) as archive:
        with archive.open("assets/aa/catalog.json") as catalog_file:
            return json.loads(catalog_file.read().decode("utf-8"))


def parse_catalog_keys(catalog: dict[str, Any]) -> list[str]:
    raw = base64.b64decode(catalog["m_KeyDataString"])
    if len(raw) < 4:
        return []

    offset = 4
    keys: list[str] = []
    while offset + 5 <= len(raw):
        encoding_flag = raw[offset]
        byte_length = int.from_bytes(raw[offset + 1 : offset + 5], "little")
        offset += 5
        if byte_length < 0 or byte_length > 100_000 or offset + byte_length > len(raw):
            break
        data = raw[offset : offset + byte_length]
        offset += byte_length
        encoding = "utf-16le" if encoding_flag == 1 else "utf-8"
        try:
            keys.append(data.decode(encoding).rstrip("\x00"))
        except UnicodeDecodeError:
            continue
    return keys


def bundle_entries(apk_path: Path) -> set[str]:
    with zipfile.ZipFile(apk_path) as archive:
        return {
            info.filename
            for info in archive.infolist()
            if BUNDLE_RE.match(info.filename)
        }


def extract_entries(apk_path: Path, entries: list[str], output_dir: Path) -> None:
    with zipfile.ZipFile(apk_path) as archive:
        for entry in entries:
            target = output_dir / entry
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(entry) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)


def export_images(
    bundle_root: Path,
    bundle_entries_to_scan: list[str],
    output_dir: Path,
    illustration_keys: list[str],
    avatar_keys: list[str],
) -> list[ExportedImage]:
    illustration_names = [filename_from_track_key(key) for key in illustration_keys]
    avatar_names = [filename_from_avatar_key(key) for key in avatar_keys]
    illustration_index = 0
    avatar_index = 0
    exports: list[ExportedImage] = []
    used_output_paths: set[Path] = set()

    for entry in bundle_entries_to_scan:
        bundle_path = bundle_root / entry
        env = UnityPy.load(str(bundle_path))
        for obj in env.objects:
            if obj.type.name != "Texture2D":
                continue
            data = obj.read()
            object_name = str(getattr(data, "m_Name", "") or "")
            image = getattr(data, "image", None)
            width = int(getattr(data, "m_Width", 0) or 0)
            height = int(getattr(data, "m_Height", 0) or 0)
            if image is None or width <= 0 or height <= 0:
                continue

            category = classify_image(object_name, width, height)
            if category is None:
                continue

            if category == "曲绘":
                source_key = illustration_keys[illustration_index] if illustration_index < len(illustration_keys) else None
                filename = illustration_names[illustration_index] if illustration_index < len(illustration_names) else f"{Path(entry).stem}_Illustration.png"
                name_source = "catalog-track-key" if source_key else "bundle-hash"
                illustration_index += 1
            else:
                source_key = avatar_keys[avatar_index] if avatar_index < len(avatar_keys) else None
                fallback_name = object_name or f"{Path(entry).stem}_Avatar"
                filename = avatar_names[avatar_index] if avatar_index < len(avatar_names) else f"{clean_filename_part(fallback_name)}.png"
                name_source = "catalog-avatar-key" if source_key else "texture-name-or-bundle-hash"
                avatar_index += 1

            target = unique_path(output_dir / category / filename, used_output_paths)
            used_output_paths.add(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target)
            try:
                del image
            except NameError:
                pass
            exports.append(
                ExportedImage(
                    bundle=entry,
                    object_name=object_name,
                    width=width,
                    height=height,
                    category=category,
                    output_path=target,
                    name_source=name_source,
                    source_key=source_key,
                )
            )

    return exports


def classify_image(object_name: str, width: int, height: int) -> str | None:
    if object_name == "Illustration" and width >= 1000 and height >= 500:
        return "曲绘"
    if width <= 200 and height <= 200:
        return "头像"
    return None


def filename_from_track_key(key: str) -> str:
    match = TRACK_ILLUSTRATION_RE.match(key)
    if not match:
        return f"{clean_filename_part(Path(key).stem)}.png"
    track_dir = match.group(1)
    parts = track_dir.rsplit(".", 2)
    if len(parts) == 3 and parts[2].isdigit():
        title, artist = parts[0], parts[1]
        return f"{clean_filename_part(title)} - {clean_filename_part(artist)}.png"
    return f"{clean_filename_part(track_dir)}.png"


def filename_from_avatar_key(key: str) -> str:
    match = AVATAR_RE.match(key)
    name = match.group(1) if match else key
    return f"{clean_filename_part(name)}.png"


def clean_filename_part(value: str) -> str:
    cleaned = UNSAFE_FILENAME_CHARS.sub("", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().rstrip(".")
    return cleaned or "unnamed"


def unique_path(path: Path, used_paths: set[Path]) -> Path:
    if path not in used_paths:
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    index = 1
    while True:
        candidate = parent / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def build_report(
    new_apk: ApkSource,
    old_apk: ApkSource,
    output_dir: Path,
    added_keys: list[str],
    added_bundles: list[str],
    illustration_keys: list[str],
    avatar_keys: list[str],
    exports: list[ExportedImage],
) -> dict[str, Any]:
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "newApk": str(new_apk.path),
        "oldApk": str(old_apk.path),
        "newVersion": new_apk.version,
        "oldVersion": old_apk.version,
        "outputDir": str(output_dir),
        "totals": {
            "addedCatalogKeys": len(added_keys),
            "addedBundles": len(added_bundles),
            "candidateIllustrations": len(illustration_keys),
            "candidateAvatars": len(avatar_keys),
            "exportedIllustrations": sum(1 for item in exports if item.category == "曲绘"),
            "exportedAvatars": sum(1 for item in exports if item.category == "头像"),
        },
        "candidateKeys": {
            "illustrations": illustration_keys,
            "avatars": avatar_keys,
        },
        "exported": [
            {
                "category": item.category,
                "outputPath": str(item.output_path.relative_to(output_dir)),
                "bundle": item.bundle,
                "objectName": item.object_name,
                "width": item.width,
                "height": item.height,
                "nameSource": item.name_source,
                "sourceKey": item.source_key,
            }
            for item in exports
        ],
        "note": (
            "Only bundles present in the new APK but absent from the old APK were scanned. "
            "Illustration names are parsed from Addressables keys and may use internal Phigros names without display spacing or punctuation."
        ),
    }


if __name__ == "__main__":
    raise SystemExit(main())
