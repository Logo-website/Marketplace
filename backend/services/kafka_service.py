import logging
logger = logging.getLogger(__name__)

class KafkaService:
    @staticmethod
    def order_created(order):
        try:
            from kafka_producer import publish_event
            publish_event('order.created', {
                'order_id': order.id,
                'buyer_id': order.buyer_id,
                'total': str(order.total_price),
            })
        except Exception as e:
            logger.error(f'Kafka order_created error: {e}')

    @staticmethod
    def order_status_changed(order):
        try:
            from kafka_producer import publish_event
            publish_event('order.status_changed', {
                'order_id': order.id,
                'status': order.status,
                'buyer_id': order.buyer_id,
            })
        except Exception as e:
            logger.error(f'Kafka order_status_changed error: {e}')