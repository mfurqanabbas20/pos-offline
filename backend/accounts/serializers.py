from django.contrib.auth import get_user_model
from rest_framework import serializers


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'is_staff']
        read_only_fields = fields

    def get_full_name(self, obj) -> str:
        return obj.get_full_name() or obj.username
