//! Lancer Tauri library entry.
//!
//! Layering (lightweight, not Java-style DDD):
//! - commands: Tauri adapter
//! - application: use cases
//! - domain: models + errors
//! - infrastructure: k8s / fs / credentials (later)

mod app;
pub mod application;
mod commands;
pub mod domain;
mod infrastructure;
mod shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}
