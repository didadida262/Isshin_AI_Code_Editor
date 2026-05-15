use std::env;

#[derive(Clone)]
pub struct Config {
    pub proxy_port: u16,
    pub public_api_target: String,
    pub site_origin: String,
    pub public_enterprise_cookie: Option<String>,
    pub document_upload_max_bytes: u64,
    pub document_extract_max_chars: usize,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            proxy_port: env::var("PROXY_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8787),
            public_api_target: env::var("PUBLIC_API_TARGET")
                .unwrap_or_else(|_| "https://aiplatform.njsrd.com".to_string())
                .trim_end_matches('/')
                .to_string(),
            site_origin: env::var("PUBLIC_ENTERPRISE_SITE_ORIGIN")
                .unwrap_or_else(|_| "https://aiplatform.njsrd.com".to_string())
                .trim_end_matches('/')
                .to_string(),
            public_enterprise_cookie: env::var("PUBLIC_ENTERPRISE_COOKIE")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            document_upload_max_bytes: env::var("DOCUMENT_UPLOAD_MAX_BYTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(15 * 1024 * 1024),
            document_extract_max_chars: env::var("DOCUMENT_EXTRACT_MAX_CHARS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(120_000),
        }
    }

    pub fn chat_completions_path(&self) -> &'static str {
        "/enterprise/api/v1/chat/completions"
    }
}
