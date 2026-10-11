from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Room member with one of two roles: admin or member."""

    class Role(models.TextChoices):
        ADMIN = "admin", "مدیر"
        MEMBER = "member", "عضو"

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

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"

    def __str__(self):
        return self.display_name or self.username

    @property
    def is_admin_role(self) -> bool:
        return self.role == self.Role.ADMIN

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.get_full_name() or self.username
        if not self.avatar_text:
            # First Persian letter of the display name for the avatar circle.
            self.avatar_text = self.display_name.strip()[:1] or "؟"
        super().save(*args, **kwargs)
