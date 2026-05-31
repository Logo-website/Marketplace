from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'password']

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError('Пароль должен содержать не менее 8 символов')
        if not any(c.isupper() for c in value):
            raise serializers.ValidationError('Пароль должен содержать хотя бы одну заглавную букву')
        if not any(c.isdigit() for c in value):
            raise serializers.ValidationError('Пароль должен содержать хотя бы одну цифру')
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError('Пользователь с таким email уже существует')
        return value.lower()

    def create(self, validated_data):
        validated_data['role'] = User.ROLE_BUYER
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'phone', 'role', 'avatar']
        read_only_fields = ['role']


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'email'