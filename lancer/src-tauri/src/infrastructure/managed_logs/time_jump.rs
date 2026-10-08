//! Locate first log line with timestamp ≥ target (ISO / time fragment).
//! See docs/logs/search-and-window-read.md § Time Jump

use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;

use serde::Deserialize;

use super::index::{index_path_for_log, SparseLineIndex};
use super::{map_io_error, AppError};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TsLine {
    line_number: u64,
    timestamp: String,
}

/// Normalize user input for comparison against kube/ISO timestamps.
fn normalize_target(raw: &str) -> String {
    let t = raw.trim();
    if t.is_empty() {
        return String::new();
    }
    // HH:mm[:ss[.frac]] → match on time suffix via contains later; keep as-is.
    t.to_string()
}

fn ts_meets(ts: &str, target: &str) -> bool {
    if ts.is_empty() || target.is_empty() {
        return false;
    }
    // Full / prefix ISO: lexicographic compare works for RFC3339.
    if target.contains('-') || target.contains('T') {
        return ts >= target;
    }
    // Time-of-day fragment: first line whose timestamp contains it.
    ts.contains(target)
}

fn read_ts_at_byte(path: &Path, byte_offset: u64) -> Result<Option<(u64, String)>, AppError> {
    let mut file = File::open(path).map_err(|e| map_io_error("open log for time jump", e))?;
    file.seek(SeekFrom::Start(byte_offset))
        .map_err(|e| map_io_error("seek for time jump", e))?;
    let mut reader = BufReader::new(file);
    let mut buf = String::new();
    let n = reader
        .read_line(&mut buf)
        .map_err(|e| map_io_error("read line time jump", e))?;
    if n == 0 {
        return Ok(None);
    }
    let parsed: TsLine = serde_json::from_str(buf.trim()).map_err(|e| {
        AppError::coded(
            "LOG_STREAM_FAILED",
            "failed to parse log line for time jump",
            Some(e.to_string()),
            false,
        )
    })?;
    Ok(Some((parsed.line_number, parsed.timestamp)))
}

/// Scan from `start_byte` for first line meeting target. Returns line_number.
fn scan_from(
    path: &Path,
    start_byte: u64,
    start_line_hint: u64,
    target: &str,
) -> Result<Option<u64>, AppError> {
    let mut file = File::open(path).map_err(|e| map_io_error("open log for time scan", e))?;
    file.seek(SeekFrom::Start(start_byte))
        .map_err(|e| map_io_error("seek time scan", e))?;
    let mut reader = BufReader::new(file);
    let mut buf = String::new();
    let mut line_no = start_line_hint;
    let mut saw_any_ts = false;

    loop {
        buf.clear();
        let n = reader
            .read_line(&mut buf)
            .map_err(|e| map_io_error("read time scan", e))?;
        if n == 0 {
            break;
        }
        if let Ok(parsed) = serde_json::from_str::<TsLine>(buf.trim()) {
            line_no = parsed.line_number;
            if !parsed.timestamp.is_empty() {
                saw_any_ts = true;
                if ts_meets(&parsed.timestamp, target) {
                    return Ok(Some(parsed.line_number));
                }
            }
        } else {
            line_no = line_no.saturating_add(1);
        }
    }

    if !saw_any_ts {
        return Err(AppError::coded(
            "LOG_STREAM_FAILED",
            "no timestamps available for time jump",
            None,
            false,
        ));
    }
    Ok(None)
}

/// Find first line number whose timestamp ≥ / matches `target`.
pub fn find_line_at_time(path: &Path, target_raw: &str) -> Result<Option<u64>, AppError> {
    let target = normalize_target(target_raw);
    if target.is_empty() {
        return Ok(None);
    }

    let idx_path = index_path_for_log(path);
    let index = SparseLineIndex::load(&idx_path).unwrap_or_default();
    let anchors = index.anchors_ref();

    if anchors.is_empty() || !(target.contains('-') || target.contains('T')) {
        // No index or time-of-day fragment → sequential from start.
        return scan_from(path, 0, 1, &target);
    }

    // Binary search anchors by timestamp (ISO lexicographic).
    let mut lo: usize = 0;
    let mut hi = anchors.len();
    while lo < hi {
        let mid = (lo + hi) / 2;
        let (_ln, off) = anchors[mid];
        match read_ts_at_byte(path, off)? {
            Some((_, ts)) if !ts.is_empty() && ts.as_str() < target.as_str() => {
                lo = mid + 1;
            }
            _ => {
                hi = mid;
            }
        }
    }

    let start_idx = lo.saturating_sub(1);
    let (start_ln, start_off) = anchors[start_idx];
    scan_from(path, start_off, start_ln, &target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn finds_iso_and_time_fragment() {
        let dir = std::env::temp_dir().join(format!(
            "lancer-time-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.log");
        {
            let mut f = File::create(&path).unwrap();
            for (i, ts) in [
                "2026-10-08T10:00:00Z",
                "2026-10-08T10:15:00Z",
                "2026-10-08T10:31:22Z",
                "2026-10-08T11:00:00Z",
            ]
            .iter()
            .enumerate()
            {
                let n = i + 1;
                writeln!(
                    f,
                    "{{\"id\":\"{n}\",\"lineNumber\":{n},\"timestamp\":\"{ts}\",\"level\":\"INFO\",\"pod\":\"p\",\"container\":\"c\",\"message\":\"m{n}\"}}"
                )
                .unwrap();
            }
        }
        assert_eq!(
            find_line_at_time(&path, "2026-10-08T10:31:00Z").unwrap(),
            Some(3)
        );
        assert_eq!(find_line_at_time(&path, "10:31:22").unwrap(), Some(3));
        assert_eq!(find_line_at_time(&path, "2026-10-08T12:00:00Z").unwrap(), None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
