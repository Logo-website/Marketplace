from rest_framework.throttling import UserRateThrottle


class ChatMessageThrottle(UserRateThrottle):
    """Анти-спам отправки сообщений в чат (§8). Подкласс UserRateThrottle - бьёт по
    авторизованному пользователю (а не по IP/email, как OTP-троттлы): чат доступен только
    залогиненным, и лимит должен висеть на конкретном человеке, а не на адресе."""
    scope = 'chat'
