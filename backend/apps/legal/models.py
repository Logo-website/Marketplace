from django.db import models
from apps.orders.models import Order


class LegalDocument(models.Model):
    """Юридический документ площадки (Ф26, узел 1.20): оферта, политика 152-ФЗ,
    условия доставки/возврата, о компании, контакты.

    Контент управляемый (правится в админке без передеплоя), а не зашитый в JSX:
    у правового документа обязаны быть редакция (version) и дата вступления в силу
    (effective_date) - это "динамика" по правилу репо №1, её место в данных, не в коде.
    Стартовый набор из 5 документов засевается data-миграцией.

    body рендерится как ТЕКСТ (без исполнения HTML, §8) - даже ошибочный/вредный
    ввод в админке не превращается в XSS на публичной странице.
    """
    # Стабильные ключи-URL: совпадают с маршрутами фронта /legal/<slug>.
    SLUG_OFERTA = 'oferta'
    SLUG_PRIVACY = 'privacy'
    SLUG_DELIVERY_RETURNS = 'delivery-returns'
    SLUG_ABOUT = 'about'
    SLUG_CONTACTS = 'contacts'

    slug = models.SlugField(max_length=50, unique=True, db_index=True)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default='')
    version = models.CharField(max_length=20, default='1.0')
    effective_date = models.DateField()
    # Только опубликованные документы видны в публичной выдаче (черновик - 404).
    is_published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['slug']
        verbose_name = 'Юридический документ'
        verbose_name_plural = 'Юридические документы'

    def __str__(self):
        return f'{self.title} (ред. {self.version})'


class Receipt(models.Model):
    """Кассовый чек 54-ФЗ - ЭМУЛЯЦИЯ (Ф26, узел 1.20).

    Реального эквайринга и онлайн-кассы/ОФД в проекте нет (README, карта 4.5).
    При создании заказа генерируется чек с псевдо-фискальными реквизитами
    (ФН/ФД/ФП) - детерминированно из заказа, ничего наружу не отправляется.
    is_emulated=True и явная плашка в UI: это не фискальный документ.

    OneToOne к заказу: один заказ - один чек. Генерация идемпотентна
    (get_or_create в services.generate_receipt), повторная попытка не плодит дубль.
    """
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='receipt')
    # Псевдо-фискальные реквизиты (эмуляция): ФН - заводской номер накопителя,
    # ФД - номер фискального документа, ФП/ФПД - фискальный признак.
    fn_number = models.CharField(max_length=16)
    fd_number = models.CharField(max_length=10)
    fiscal_sign = models.CharField(max_length=10)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_emulated = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Чек (эмуляция) к заказу #{self.order_id}'
