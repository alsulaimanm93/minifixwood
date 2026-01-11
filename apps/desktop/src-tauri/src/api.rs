use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde::de::DeserializeOwned;

#[derive(Clone)]
pub struct ApiClient {
    base: String,
    token: String,
    http: reqwest::Client,
}

impl ApiClient {
    pub fn new(base: String, token: String) -> Self {
        Self { base, token, http: reqwest::Client::new() }
    }

    fn headers(&self) -> Result<HeaderMap> {
        let mut h = HeaderMap::new();
        let v = HeaderValue::from_str(&format!("Bearer {}", self.token))?;
        h.insert(AUTHORIZATION, v);
        Ok(h)
    }

    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base, path);
        let res = self.http.get(url).headers(self.headers()?).send().await?;
        if !res.status().is_success() {
            return Err(anyhow!("API GET failed: {}", res.status()));
        }
        Ok(res.json::<T>().await?)
    }

    pub async fn post_json<B: serde::Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> Result<T> {
        let url = format!("{}{}", self.base, path);
        let res = self.http.post(url).headers(self.headers()?).json(body).send().await?;
        if !res.status().is_success() {
            return Err(anyhow!("API POST failed: {}", res.status()));
        }
        Ok(res.json::<T>().await?)
    }
}
