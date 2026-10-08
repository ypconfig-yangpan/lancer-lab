//! Managed-log search via ripgrep regex matcher on **message/level** (not raw JSON keys).
//! See docs/logs/search-architecture.md

use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use grep_matcher::Matcher;
use grep_regex::RegexMatcherBuilder;
use serde::Deserialize;
use serde::Serialize;

use super::{map_io_error, AppError};

#[derive(Debug, Clone)]
pub struct SearchQuery {
    pub pattern: String,
    pub regex: bool,
    pub case_sensitive: bool,
    pub max_matches: usize,
    /// Resume after this absolute byte offset.
    pub cursor_byte: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchDto {
    pub line_number: u64,
    pub byte_offset: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultDto {
    pub matches: Vec<SearchMatchDto>,
    pub next_cursor_byte: Option<u64>,
    pub has_more: bool,
    pub truncated: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchableLine {
    line_number: u64,
    #[serde(default)]
    level: String,
    #[serde(default)]
    message: String,
}

pub fn search_log_file(
    path: &Path,
    query: &SearchQuery,
    cancelled: Arc<AtomicBool>,
) -> Result<SearchResultDto, AppError> {
    if query.pattern.is_empty() {
        return Ok(SearchResultDto {
            matches: Vec::new(),
            next_cursor_byte: None,
            has_more: false,
            truncated: false,
        });
    }

    let max = query.max_matches.clamp(1, 5_000);
    let pattern = if query.regex {
        query.pattern.clone()
    } else {
        regex::escape(&query.pattern)
    };

    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(!query.case_sensitive)
        .build(&pattern)
        .map_err(|e| {
            AppError::coded(
                "LOG_STREAM_FAILED",
                format!("invalid search pattern: {e}"),
                Some(e.to_string()),
                false,
            )
        })?;

    let mut file = File::open(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::coded(
                "LOG_FILE_NOT_FOUND",
                format!("managed log file missing: {}", path.display()),
                None,
                false,
            )
        } else {
            map_io_error("open log for search", e)
        }
    })?;

    if query.cursor_byte > 0 {
        file.seek(SeekFrom::Start(query.cursor_byte))
            .map_err(|e| map_io_error("seek search cursor", e))?;
    }

    let mut reader = BufReader::new(file);
    let mut buf = String::new();
    let mut matches = Vec::with_capacity(max.min(256));
    let mut byte_pos = query.cursor_byte;
    let mut last_match_end = query.cursor_byte;
    let mut hit_limit = false;

    loop {
        if cancelled.load(Ordering::Relaxed) {
            break;
        }
        buf.clear();
        let line_start = byte_pos;
        let n = reader
            .read_line(&mut buf)
            .map_err(|e| map_io_error("read log for search", e))?;
        if n == 0 {
            break;
        }
        byte_pos += n as u64;

        let Ok(parsed) = serde_json::from_str::<SearchableLine>(buf.trim()) else {
            continue;
        };

        // Search message + level only — never raw JSON keys (pod/container/id…).
        let haystack = if parsed.level.is_empty() {
            parsed.message.clone()
        } else {
            format!("{} {}", parsed.level, parsed.message)
        };

        let found = matcher
            .find(haystack.as_bytes())
            .map_err(|e| {
                AppError::coded(
                    "LOG_STREAM_FAILED",
                    format!("search matcher failed: {e}"),
                    Some(e.to_string()),
                    false,
                )
            })?
            .is_some();

        if !found {
            continue;
        }

        last_match_end = byte_pos;
        matches.push(SearchMatchDto {
            line_number: parsed.line_number,
            byte_offset: line_start,
        });
        if matches.len() >= max {
            hit_limit = true;
            break;
        }
    }

    let next_cursor_byte = if hit_limit {
        Some(last_match_end)
    } else {
        None
    };

    Ok(SearchResultDto {
        matches,
        next_cursor_byte,
        has_more: hit_limit,
        truncated: hit_limit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn finds_message_not_json_keys() {
        let dir = std::env::temp_dir().join(format!(
            "lancer-search-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.log");
        {
            let mut f = File::create(&path).unwrap();
            for i in 1..=20u64 {
                let msg = if i == 7 {
                    "connection refused"
                } else {
                    "ok"
                };
                writeln!(
                    f,
                    "{{\"id\":\"x\",\"lineNumber\":{i},\"timestamp\":\"t\",\"level\":\"INFO\",\"pod\":\"payment\",\"container\":\"app\",\"message\":\"{msg}\"}}"
                )
                .unwrap();
            }
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        // Must NOT match every line via JSON key "pod" / "message".
        let r_pod = search_log_file(
            &path,
            &SearchQuery {
                pattern: "payment".into(),
                regex: false,
                case_sensitive: false,
                max_matches: 50,
                cursor_byte: 0,
            },
            cancelled.clone(),
        )
        .unwrap();
        assert!(r_pod.matches.is_empty());

        let r1 = search_log_file(
            &path,
            &SearchQuery {
                pattern: "refused".into(),
                regex: false,
                case_sensitive: false,
                max_matches: 2,
                cursor_byte: 0,
            },
            cancelled.clone(),
        )
        .unwrap();
        assert_eq!(r1.matches.len(), 1);
        assert_eq!(r1.matches[0].line_number, 7);

        let r_level = search_log_file(
            &path,
            &SearchQuery {
                pattern: "INFO".into(),
                regex: false,
                case_sensitive: false,
                max_matches: 5,
                cursor_byte: 0,
            },
            cancelled.clone(),
        )
        .unwrap();
        assert_eq!(r_level.matches.len(), 5);
        assert!(r_level.has_more);
        let cursor = r_level.next_cursor_byte.expect("cursor");
        let r2 = search_log_file(
            &path,
            &SearchQuery {
                pattern: "INFO".into(),
                regex: false,
                case_sensitive: false,
                max_matches: 50,
                cursor_byte: cursor,
            },
            cancelled,
        )
        .unwrap();
        assert!(!r2.matches.is_empty());
        assert!(r2.matches[0].byte_offset >= cursor);
        let _ = std::fs::remove_dir_all(dir);
    }
}
