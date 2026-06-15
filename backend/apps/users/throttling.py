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
