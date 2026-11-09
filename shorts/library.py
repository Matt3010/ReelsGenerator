"""Reusable image library: PNGs in <root>/images, an SQLite index (SQLAlchemy ORM, Alembic migrations)."""
from __future__ import annotations

import hashlib
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from PIL import Image
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

MIGRATIONS = Path(__file__).parent / "migrations"


class Base(DeclarativeBase):
    pass


class AssetRow(Base):
    __tablename__ = "assets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    file: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str] = mapped_column(Text)
    prompt_key: Mapped[str] = mapped_column(Text, index=True)
    style: Mapped[str] = mapped_column(String(60), index=True)
    seed: Mapped[int] = mapped_column(Integer)
    model: Mapped[str] = mapped_column(String(200))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    uses: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    tags: Mapped[list["TagRow"]] = relationship(cascade="all, delete-orphan", order_by="TagRow.position")


class TagRow(Base):
    __tablename__ = "asset_tags"
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True)
    tag: Mapped[str] = mapped_column(String(60), primary_key=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


@dataclass(frozen=True)
class Asset:
    id: int
    path: Path
    prompt: str
    tags: list[str]
    style: str
    seed: int
    model: str
    width: int
    height: int
    uses: int


def prompt_key(prompt: str) -> str:
    return re.sub(r"\s+", " ", prompt.strip().lower())


def clean_tags(tags: list[str]) -> list[str]:
    out: list[str] = []
    for t in tags:
        t = t.strip().lower()
        if t and t not in out:
            out.append(t)
    return out


class Library:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.images_dir = self.root / "images"
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / "library.db"
        self.url = f"sqlite:///{self.db_path.as_posix()}"
        self.migrate()
        self.engine = create_engine(self.url)

    def migrate(self) -> None:
        cfg = Config()
        cfg.set_main_option("script_location", str(MIGRATIONS))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "head")

    def _asset(self, row: AssetRow) -> Asset:
        return Asset(row.id, self.images_dir / row.file, row.prompt, [t.tag for t in row.tags], row.style, row.seed,
                     row.model, row.width, row.height, row.uses)

    def add(self, image: Path, *, prompt: str, tags: list[str], style: str, seed: int, model: str) -> Asset:
        data = Path(image).read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        with Session(self.engine) as s, s.begin():
            row = s.scalar(select(AssetRow).where(AssetRow.sha256 == sha))
            if row is None:
                file = f"{sha[:16]}{Path(image).suffix.lower() or '.png'}"
                dst = self.images_dir / file
                if not dst.exists():
                    shutil.copyfile(image, dst)
                with Image.open(dst) as im:
                    w, h = im.size
                row = AssetRow(sha256=sha, file=file, prompt=prompt, prompt_key=prompt_key(prompt), style=style,
                               seed=seed, model=model, width=w, height=h, uses=0,
                               created_at=datetime.now(timezone.utc),
                               tags=[TagRow(tag=t, position=i) for i, t in enumerate(clean_tags(tags))])
                s.add(row)
                s.flush()
            return self._asset(row)

    def get(self, asset_id: int) -> Asset | None:
        with Session(self.engine) as s:
            row = s.get(AssetRow, asset_id)
            return self._asset(row) if row else None

    def find_exact(self, prompt: str, style: str) -> Asset | None:
        with Session(self.engine) as s:
            row = s.scalar(select(AssetRow).where(AssetRow.prompt_key == prompt_key(prompt), AssetRow.style == style)
                           .order_by(AssetRow.id))
            return self._asset(row) if row else None

    def candidates(self, tags: list[str], style: str, min_overlap: float = 0.5, limit: int = 5) -> list[Asset]:
        """assets in the same style ranked by tag overlap (Jaccard), best first"""
        want = set(clean_tags(tags))
        if not want:
            return []
        with Session(self.engine) as s:
            rows = s.scalars(select(AssetRow).join(TagRow).where(TagRow.tag.in_(want), AssetRow.style == style)
                             .distinct()).all()
            scored = []
            for row in rows:
                have = {t.tag for t in row.tags}
                score = len(want & have) / len(want | have)
                if score >= min_overlap:
                    scored.append((-score, row.id, row))
            return [self._asset(r) for _, _, r in sorted(scored, key=lambda x: x[:2])[:limit]]

    def mark_used(self, asset_id: int) -> None:
        with Session(self.engine) as s, s.begin():
            row = s.get(AssetRow, asset_id)
            if row is not None:
                row.uses += 1
