"""Build a Halo theme archive with portable directory entries."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo
import re


ROOT = Path(__file__).resolve().parent.parent
VERSION = re.search(r"(?m)^  version: (\S+)$", (ROOT / "theme.yaml").read_text(encoding="utf-8"))
if not VERSION:
    raise SystemExit("theme.yaml does not declare a version")

OUTPUT = ROOT / f"theme-Serenity-{VERSION.group(1)}.zip"


def add_directory(archive: ZipFile, path: Path) -> None:
    info = ZipInfo(path.relative_to(ROOT).as_posix().rstrip("/") + "/")
    info.create_system = 3
    info.external_attr = (0o40755 << 16) | 0x10
    info.compress_type = ZIP_STORED
    archive.writestr(info, b"")


def add_file(archive: ZipFile, path: Path) -> None:
    info = ZipInfo(path.relative_to(ROOT).as_posix())
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.compress_type = ZIP_DEFLATED
    archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=6)


with ZipFile(OUTPUT, "w") as archive:
    for name in ("theme.yaml", "settings.yaml", "templates", "LICENSE", "README.md"):
        path = ROOT / name
        if path.is_dir():
            add_directory(archive, path)
            for child in sorted(path.rglob("*")):
                if child.is_dir():
                    add_directory(archive, child)
                else:
                    add_file(archive, child)
        else:
            add_file(archive, path)

with ZipFile(OUTPUT) as archive:
    if archive.testzip() or "templates/index.html" not in archive.namelist():
        raise SystemExit("theme archive verification failed")

print(OUTPUT)
