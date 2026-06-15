"""Единый источник парольной политики (S6).

Раньше правила дублировались в RegisterSerializer и PasswordResetVerifyView
и расходились (сброс требовал спецсимвол, регистрация - нет). Теперь
обе точки зовут validate_password_strength, политика одна.
"""
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

SPECIAL_CHARS = "!@#$%^&*()_+-=[]{};':\"|,.<>/?\\"


def validate_password_strength(value, user=None):
    """Проверяет пароль: длина, заглавная, цифра, спецсимвол + Django-валидаторы.

    Бросает rest_framework.serializers.ValidationError со списком всех
    нарушений сразу (а не по одному). Подходит и для serializer-валидации,
    и для ручного вызова во view.
    """
    errors = []
    if len(value) < 8:
        errors.append('Пароль должен содержать не менее 8 символов')
    if not any(c.isupper() for c in value):
        errors.append('Пароль должен содержать хотя бы одну заглавную букву')
    if not any(c.isdigit() for c in value):
        errors.append('Пароль должен содержать хотя бы одну цифру')
    if not any(c in SPECIAL_CHARS for c in value):
        errors.append('Пароль должен содержать хотя бы один специальный символ')

    # AUTH_PASSWORD_VALIDATORS: общие/словарные пароли, похожесть на email и т.п.
    try:
        password_validation.validate_password(value, user)
    except DjangoValidationError as e:
        errors.extend(e.messages)

    if errors:
        raise serializers.ValidationError(errors)
    return value
