// Configuration for the local HTTP API used by the Chrome extension.

// Replace with your extension ID (chrome-extension://<extension-id>).
pub const EXTENSION_ORIGINS: [&str; 1] = ["chrome-extension://lpgangnajjlckbbbneekloefajifkebb"];

// Shared secret used by the extension to authenticate with the local API.
pub const EXTENSION_TOKEN: &str = "extrabrain-extension-token";

pub fn extension_token() -> &'static str {
    EXTENSION_TOKEN
}
