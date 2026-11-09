"""image library: assets and their tags

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("file", sa.String(200), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("prompt_key", sa.Text, nullable=False, index=True),
        sa.Column("style", sa.String(60), nullable=False, index=True),
        sa.Column("seed", sa.Integer, nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("width", sa.Integer, nullable=False),
        sa.Column("height", sa.Integer, nullable=False),
        sa.Column("uses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "asset_tags",
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag", sa.String(60), primary_key=True, index=True),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("asset_tags")
    op.drop_table("assets")
