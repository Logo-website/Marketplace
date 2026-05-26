from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Product
from clickhouse import get_seller_stats
from apps.permissions import IsSeller

class SellerAnalyticsView(APIView):
    permission_classes = [IsSeller]

    def get(self, request):
        products = Product.objects.filter(seller=request.user).values_list('id', 'name')
        product_ids = [p[0] for p in products]
        product_names = {p[0]: p[1] for p in products}

        stats_raw = get_seller_stats(product_ids)

        stats = {}
        for product_id, event_type, count in stats_raw:
            if product_id not in stats:
                stats[product_id] = {
                    'product_id': product_id,
                    'name': product_names.get(product_id, ''),
                    'views': 0,
                    'purchases': 0,
                }
            if event_type == 'view':
                stats[product_id]['views'] = count
            elif event_type == 'purchase':
                stats[product_id]['purchases'] = count

        return Response(list(stats.values()))