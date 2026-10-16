from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Room member with one of two roles: admin or member."""

    class Role(models.TextChoices):
        ADMIN = "admin", "مدیر"
        MEMBER = "member", "عضو"

    # Palette used for the default avatar tile when no colour/image is set.
    AVATAR_COLORS = [
        "#2563EB",
        "#7C3AED",
        "#DB2777",
        "#DC2626",
        "#EA580C",
        "#CA8A04",
        "#16A34A",
        "#0891B2",
        "#4F46E5",
        "#9333EA",
    ]

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
        verbose_name="نقش",
    )
    # Persian display name shown across the UI (e.g. علی رضایی).
    display_name = models.CharField(
        max_length=100, blank=True, verbose_name="نام نمایشی"
    )
    # Short initial used for avatars.
    avatar_text = models.CharField(
        max_length=10, blank=True, verbose_name="متن آواتار"
    )
    # Optional custom avatar colour (HEX) and uploaded image (data URL).
    avatar_color = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="رنگ آواتار",
        help_text="رنگ HEX پس‌زمینه‌ی آواتار؛ خالی باشد خودکار انتخاب می‌شود.",
    )
    avatar_image = models.TextField(
        blank=True,
        default="",
        verbose_name="تصویر آواتار",
        help_text="تصویر آپلودشده به‌صورت data URL؛ خالی باشد از حرف اول استفاده می‌شود.",
    )

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"

    def __str__(self):
        return self.display_name or self.username

    @property
    def is_admin_role(self) -> bool:
        return self.role == self.Role.ADMIN

    @property
    def avatar_bg(self) -> str:
        """Deterministic default avatar colour when none is customised."""
        if self.avatar_color:
            return self.avatar_color
        if self.id:
            return self.AVATAR_COLORS[self.id % len(self.AVATAR_COLORS)]
        return self.AVATAR_COLORS[0]

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.get_full_name() or self.username
        if not self.avatar_text:
            # First Persian letter of the display name for the avatar circle.
            self.avatar_text = self.display_name.strip()[:1] or "؟"
        super().save(*args, **kwargs)
