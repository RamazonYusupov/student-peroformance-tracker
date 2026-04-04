from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./student_tracker.db"
    jwt_secret_key: str = "change-me-super-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    teacher_username: str = "teacher"
    teacher_password: str = "teacher123"


settings = Settings()
