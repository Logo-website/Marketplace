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


# --- Реквизиты продавца (Ф11) ---

# Поля, без которых заявка не считается полной (комплект для активации).
# Логотип/описание/название витрины сюда НЕ входят: для активации нужны
# юр-данные + реквизиты выплат + принятая оферта (условие карты).
ONBOARDING_REQUIRED_FIELDS = ('legal_status', 'legal_name', 'inn', 'bank_account', 'bank_bik')

# Контрольные коэффициенты ИНН (ФНС): по ним считается контрольная цифра.
_INN_COEF_11 = (7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
_INN_COEF_12 = (3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
_INN_COEF_10 = (2, 4, 10, 3, 5, 9, 4, 6, 8)


def _inn_check_digit(digits, coef):
    n = sum(d * c for d, c in zip(digits, coef)) % 11
    return n % 10 if n > 9 else n


def validate_inn(value, legal_status):
    """Проверяет ИНН по статусу: 12 цифр для самозанятого/ИП, 10 для ООО, плюс
    контрольная цифра (алгоритм ФНС). Бросает serializers.ValidationError.

    Без проверки через ФНС (вне скоупа) - только формат. Источник истины о
    «правильной длине» - legal_status, поэтому ИНН валидируем вместе с ним."""
    v = (value or '').strip()
    if not v.isdigit():
        raise serializers.ValidationError('ИНН должен состоять только из цифр')

    # ООО - 10 цифр, самозанятый/ИП (физлицо) - 12 цифр.
    expected_len = 10 if legal_status == 'ooo' else 12
    if len(v) != expected_len:
        raise serializers.ValidationError(f'ИНН должен содержать {expected_len} цифр для выбранного статуса')

    digits = [int(c) for c in v]
    if expected_len == 10:
        if digits[9] != _inn_check_digit(digits, _INN_COEF_10):
            raise serializers.ValidationError('Неверный ИНН (контрольная цифра)')
    else:
        c11 = _inn_check_digit(digits, _INN_COEF_11)
        c12 = _inn_check_digit(digits, _INN_COEF_12)
        if digits[10] != c11 or digits[11] != c12:
            raise serializers.ValidationError('Неверный ИНН (контрольная цифра)')
    return v


def is_onboarding_complete(data):
    """Единственный источник правды «комплект полон» - переиспользуется
    сериализатором и логикой активации, чтобы условие не раздваивалось.

    Полнота = все обязательные поля заполнены И оферта принята. Формат ИНН тут
    НЕ проверяется (это делает validate_inn раньше, на этапе 400); здесь только
    наличие, чтобы отличить «валидно-но-неполно» (черновик) от ошибки формата."""
    for field in ONBOARDING_REQUIRED_FIELDS:
        if not str(data.get(field, '') or '').strip():
            return False
    return bool(data.get('offer_accepted'))
