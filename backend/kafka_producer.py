from kafka import KafkaProducer
from django.conf import settings
import json


producer = None


def get_producer():
    global producer
    if producer is None:
        try:
            producer = KafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
        except Exception:
            return None
    return producer


def publish_event(topic, data):
    p = get_producer()
    if p:
        try:
            p.send(topic, data)
            p.flush()
        except Exception:
            pass