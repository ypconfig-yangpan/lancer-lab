//! Sparse line → byte-offset index for JSONL managed logs.
//! See docs/logs/storage-and-index.md

use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Seek, Write};
use std::path::{Path, PathBuf};

use super::{map_io_error, AppError};

/// Record an anchor about every N lines (plus line 1).
pub const INDEX_STRIDE: u64 = 1_000;

#[derive(Debug, Clone, Default)]
pub struct SparseLineIndex {
    /// Sorted (line_number 1-based, byte_offset).
    anchors: Vec<(u64, u64)>,
}

impl SparseLineIndex {
    pub fn record_if_needed(&mut self, line_number: u64, byte_offset: u64) {
        if line_number == 0 {
            return;
        }
        if line_number == 1 || (line_number - 1) % INDEX_STRIDE == 0 {
            if self
                .anchors
                .last()
                .is_some_and(|(ln, _)| *ln == line_number)
            {
                return;
            }
            self.anchors.push((line_number, byte_offset));
        }
    }

    pub fn anchors_ref(&self) -> &[(u64, u64)] {
        &self.anchors
    }

    /// Largest anchor with line_number ≤ target (1-based).
    pub fn seek_hint(&self, target_line: u64) -> Option<(u64, u64)> {
        if target_line == 0 || self.anchors.is_empty() {
            return None;
        }
        let mut best = None;
        for &(ln, off) in &self.anchors {
            if ln <= target_line {
                best = Some((ln, off));
            } else {
                break;
            }
        }
        best
    }

    pub fn load(path: &Path) -> Result<Self, AppError> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let file = File::open(path).map_err(|e| map_io_error("open sparse index", e))?;
        let reader = BufReader::new(file);
        let mut anchors = Vec::new();
        for result in reader.lines() {
            let line = result.map_err(|e| map_io_error("read sparse index", e))?;
            let mut parts = line.split_whitespace();
            let Some(ln_s) = parts.next() else {
                continue;
            };
            let Some(off_s) = parts.next() else {
                continue;
            };
            let Ok(ln) = ln_s.parse::<u64>() else {
                continue;
            };
            let Ok(off) = off_s.parse::<u64>() else {
                continue;
            };
            anchors.push((ln, off));
        }
        anchors.sort_by_key(|(ln, _)| *ln);
        Ok(Self { anchors })
    }

    pub fn save(&self, path: &Path) -> Result<(), AppError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| map_io_error("create index parent", e))?;
        }
        let mut file = File::create(path).map_err(|e| map_io_error("create sparse index", e))?;
        for &(ln, off) in &self.anchors {
            writeln!(file, "{ln} {off}").map_err(|e| map_io_error("write sparse index", e))?;
        }
        file.flush()
            .map_err(|e| map_io_error("flush sparse index", e))?;
        Ok(())
    }

    pub fn append_anchor_file(path: &Path, line_number: u64, byte_offset: u64) -> Result<(), AppError> {
        if line_number == 0 {
            return Ok(());
        }
        if !(line_number == 1 || (line_number - 1) % INDEX_STRIDE == 0) {
            return Ok(());
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| map_io_error("create index parent", e))?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| map_io_error("append sparse index", e))?;
        writeln!(file, "{line_number} {byte_offset}")
            .map_err(|e| map_io_error("write sparse index line", e))?;
        Ok(())
    }
}

pub fn index_path_for_log(log_path: &Path) -> PathBuf {
    let mut p = log_path.to_path_buf();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!("{e}.idx"))
        .unwrap_or_else(|| "idx".to_string());
    p.set_extension(ext);
    p
}

/// Rebuild sparse index by scanning JSONL (recovery when .idx missing).
pub fn rebuild_index_from_log(log_path: &Path) -> Result<SparseLineIndex, AppError> {
    let file = File::open(log_path).map_err(|e| map_io_error("open log for index rebuild", e))?;
    let mut reader = BufReader::new(file);
    let mut index = SparseLineIndex::default();
    let mut line_no = 0u64;
    loop {
        let offset = reader
            .stream_position()
            .map_err(|e| map_io_error("stream_position", e))?;
        let mut buf = String::new();
        let n = reader
            .read_line(&mut buf)
            .map_err(|e| map_io_error("read_line rebuild", e))?;
        if n == 0 {
            break;
        }
        line_no += 1;
        index.record_if_needed(line_no, offset);
    }
    let idx_path = index_path_for_log(log_path);
    index.save(&idx_path)?;
    Ok(index)
}

/// Retention: delete oldest `.log` (+ `.idx`) under root by mtime / total size.
pub fn run_retention(root: &Path, max_age_days: u64, max_total_bytes: u64) -> Result<usize, AppError> {
    if !root.exists() {
        return Ok(0);
    }
    let now = std::time::SystemTime::now();
    let max_age = std::time::Duration::from_secs(max_age_days.saturating_mul(24 * 3600));

    let mut entries: Vec<(PathBuf, std::time::SystemTime, u64)> = Vec::new();
    for ent in fs::read_dir(root).map_err(|e| map_io_error("read managed-logs dir", e))? {
        let ent = ent.map_err(|e| map_io_error("read_dir entry", e))?;
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        let meta = ent.metadata().map_err(|e| map_io_error("metadata", e))?;
        let modified = meta.modified().unwrap_or(now);
        let len = meta.len();
        entries.push((path, modified, len));
    }

    entries.sort_by_key(|(_, m, _)| *m);
    let mut deleted = 0usize;
    let mut total: u64 = entries.iter().map(|(_, _, l)| *l).sum();

    for (path, modified, len) in &entries {
        let too_old = now
            .duration_since(*modified)
            .map(|d| d > max_age)
            .unwrap_or(false);
        let over_quota = total > max_total_bytes;
        if !too_old && !over_quota {
            continue;
        }
        let idx = index_path_for_log(path);
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(&idx);
        total = total.saturating_sub(*len);
        deleted += 1;
    }
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn seek_hint_picks_nearest() {
        let mut idx = SparseLineIndex::default();
        idx.record_if_needed(1, 0);
        idx.record_if_needed(1001, 50_000);
        idx.record_if_needed(2001, 100_000);
        assert_eq!(idx.seek_hint(1500), Some((1001, 50_000)));
        assert_eq!(idx.seek_hint(1), Some((1, 0)));
        assert_eq!(idx.seek_hint(2500), Some((2001, 100_000)));
    }

    #[test]
    fn rebuild_and_roundtrip() {
        let dir = std::env::temp_dir().join(format!(
            "lancer-idx-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        fs::create_dir_all(&dir).unwrap();
        let log = dir.join("t.log");
        {
            let mut f = File::create(&log).unwrap();
            for i in 1..=2500u64 {
                writeln!(f, "{{\"lineNumber\":{i},\"message\":\"m{i}\"}}").unwrap();
            }
        }
        let idx = rebuild_index_from_log(&log).unwrap();
        assert!(idx.seek_hint(2000).is_some());
        let loaded = SparseLineIndex::load(&index_path_for_log(&log)).unwrap();
        assert_eq!(loaded.seek_hint(2000), idx.seek_hint(2000));
        let _ = fs::remove_dir_all(dir);
    }
}
