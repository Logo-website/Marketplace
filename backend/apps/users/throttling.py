from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'


class EmailIPThrottle(SimpleRateThrottle):
    """Лимит по паре email+IP.

    AnonRateThrottle бьёт только по IP - с ботнета (много IP) брутфорс
    кода всё равно реален. Привязка к email сужает окно перебора конкретного
    кода, а IP не даёт перебирать много email с одной машины.
    """

    def get_cache_key(self, request, view):
        email = (request.data.get('email') or '').strip().lower()
        ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'{email}:{ident}'}


class VerifyRateThrottle(EmailIPThrottle):
    """Анти-брутфорс ввода 6-значного OTP-кода на verify-эндпоинтах."""
    scope = 'verify'


class PasswordResetRequestThrottle(EmailIPThrottle):
    """Анти-бомбинг: не дать заваливать чужую почту письмами сброса."""
    scope = 'password_reset'


class EmailChangeRequestThrottle(SimpleRateThrottle):
    """Кап писем смены email по пользователю (R5/R6).

    Эндпоинт под IsAuthenticated, поэтому login-style IP-троттлы (AnonRateThrottle)
    тут no-op (возвращают None для аутентифицированных), а глобальный user 1000/day
    слишком слаб против email-бомбинга чужого адреса. Ключ - по request.user.pk.
    """
    scope = 'email_change'

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}


class EmailChangeVerifyThrottle(SimpleRateThrottle):
    """Анти-брутфорс OTP-кода при смене email.

    По образцу EmailIPThrottle, но читает new_email (контракт фичи), а не email -
    иначе деградировал бы до чистого IP. Скоуп verify общий с прочими verify.
    """
    scope = 'verify'

    def get_cache_key(self, request, view):
        new_email = (request.data.get('new_email') or '').strip().lower()
        ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': f'{new_email}:{ident}'}
