from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./aangan.db"
    db_null_pool: bool = False  # tests: pytest makes a new event loop per test, so pooled connections must not be reused
    # "mock" = deterministic offline planner (default, no keys needed)
    llm_provider: str = "mock"  # mock | gemini | anthropic
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-5-5"
    # Safety defaults (INR). Users can override per family.
    default_auto_approve_limit_inr: int = 2500
    escalation_seconds: int = 30
    cors_origins: str = "http://localhost:3000"
    signing_secret: str = "dev-only-change-me"
    # When true, approvals must carry a valid Ed25519 signature from the registered device key.
    require_signature: bool = False
    watchdog_interval_seconds: int = 5
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    live_lookups: bool = True  # OpenStreetMap hospitals + Open-Meteo weather; tests turn this off
    guardian_interval_minutes: int = 60
    enable_dev_endpoints: bool = False  # simulate-inbound endpoints; must stay off in production
    # WhatsApp Cloud API
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    # Test-mode safety: comma-separated last-10-digit numbers. When set, WhatsApp is sent ONLY to these numbers.
    whatsapp_allowed_recipients: str = ""
    sarvam_api_key: str = ""


settings = Settings()
