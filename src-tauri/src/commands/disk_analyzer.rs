use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct DiskSpaceEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_directory: bool,
    pub children: Option<Vec<DiskSpaceEntry>>,
}

/// Scan a directory and return its top-level children with sizes.
/// Uses depth=1 for the initial view, then the user can drill down.
#[tauri::command]
pub async fn scan_directory_sizes(path: String, depth: u32) -> Result<Vec<DiskSpaceEntry>, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !target.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    tokio::task::spawn_blocking(move || {
        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(&target)
            .map_err(|e| format!("Cannot read directory: {}", e))?;

        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let name = entry.file_name().to_string_lossy().to_string();
            let full_path = entry.path().to_string_lossy().to_string();

            if meta.is_dir() {
                let size = calc_dir_size(&entry.path(), 0, 3); // max 3 levels deep for speed
                let children = if depth > 0 {
                    Some(scan_children(&entry.path(), depth - 1))
                } else {
                    None
                };
                entries.push(DiskSpaceEntry {
                    name,
                    path: full_path,
                    size_bytes: size,
                    is_directory: true,
                    children,
                });
            } else {
                entries.push(DiskSpaceEntry {
                    name,
                    path: full_path,
                    size_bytes: meta.len(),
                    is_directory: false,
                    children: None,
                });
            }
        }

        // Sort by size descending
        entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

        Ok(entries)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get top-level known folders with their sizes for an overview.
#[tauri::command]
pub async fn get_disk_overview(drive: String) -> Result<Vec<DiskSpaceEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let drive_root = if drive.ends_with('\\') || drive.ends_with('/') {
            drive.clone()
        } else {
            format!("{}\\", drive)
        };

        let known_folders = vec![
            ("Windows", format!("{}Windows", drive_root)),
            ("Program Files", format!("{}Program Files", drive_root)),
            ("Program Files (x86)", format!("{}Program Files (x86)", drive_root)),
            ("Users", format!("{}Users", drive_root)),
            ("ProgramData", format!("{}ProgramData", drive_root)),
        ];

        let mut entries = Vec::new();

        for (name, path) in known_folders {
            let p = PathBuf::from(&path);
            if p.exists() && p.is_dir() {
                let size = calc_dir_size(&p, 0, 2);
                entries.push(DiskSpaceEntry {
                    name: name.to_string(),
                    path,
                    size_bytes: size,
                    is_directory: true,
                    children: None,
                });
            }
        }

        // Add "Other" for remainder
        let total_used = entries.iter().map(|e| e.size_bytes).sum::<u64>();

        // Get total used on disk
        let disk_path = PathBuf::from(&drive_root);
        if let Ok(disk_meta) = fs2_total_used(&disk_path) {
            if disk_meta > total_used {
                entries.push(DiskSpaceEntry {
                    name: "Other".to_string(),
                    path: drive_root,
                    size_bytes: disk_meta - total_used,
                    is_directory: true,
                    children: None,
                });
            }
        }

        entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        Ok(entries)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Calculate directory size recursively, with a depth limit.
fn calc_dir_size(path: &PathBuf, current_depth: u32, max_depth: u32) -> u64 {
    if current_depth > max_depth {
        return 0;
    }

    let read_dir = match std::fs::read_dir(path) {
        Ok(rd) => rd,
        Err(_) => return 0,
    };

    let mut total: u64 = 0;
    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            total += calc_dir_size(&entry.path(), current_depth + 1, max_depth);
        } else {
            total += meta.len();
        }
    }
    total
}

fn scan_children(path: &PathBuf, depth: u32) -> Vec<DiskSpaceEntry> {
    let read_dir = match std::fs::read_dir(path) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(),
    };

    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path().to_string_lossy().to_string();

        if meta.is_dir() {
            let size = calc_dir_size(&entry.path(), 0, 2);
            let children = if depth > 0 {
                Some(scan_children(&entry.path(), depth - 1))
            } else {
                None
            };
            entries.push(DiskSpaceEntry {
                name,
                path: full_path,
                size_bytes: size,
                is_directory: true,
                children,
            });
        } else {
            entries.push(DiskSpaceEntry {
                name,
                path: full_path,
                size_bytes: meta.len(),
                is_directory: false,
                children: None,
            });
        }
    }

    entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    entries
}

/// Get total used bytes on a drive using sysinfo Disks API.
fn fs2_total_used(path: &PathBuf) -> Result<u64, String> {
    use sysinfo::Disks;

    let disks = Disks::new_with_refreshed_list();
    let path_str = path.to_string_lossy().to_uppercase();

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_uppercase();
        if path_str.starts_with(&mount) || mount.starts_with(&path_str) {
            let total = disk.total_space();
            let available = disk.available_space();
            return Ok(total.saturating_sub(available));
        }
    }

    Err("Disk not found".to_string())
}
