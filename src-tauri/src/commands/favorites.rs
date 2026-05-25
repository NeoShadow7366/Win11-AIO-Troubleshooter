use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FavoriteItem {
    pub item_type: String, // "process" or "service"
    pub name: String,
    pub display_name: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct FavoritesStore {
    favorites: Vec<FavoriteItem>,
}

fn get_favorites_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "Could not resolve %APPDATA%".to_string())?;
    let dir = PathBuf::from(appdata).join("com.aio-troubleshooter.app");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create favorites directory: {}", e))?;
    }
    Ok(dir.join("favorites.json"))
}

fn load_store() -> Result<FavoritesStore, String> {
    let path = get_favorites_path()?;
    if !path.exists() {
        return Ok(FavoritesStore::default());
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read favorites: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse favorites: {}", e))
}

fn save_store(store: &FavoritesStore) -> Result<(), String> {
    let path = get_favorites_path()?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize favorites: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write favorites: {}", e))
}

/// Returns all stored favorites.
#[tauri::command]
pub async fn get_favorites() -> Result<Vec<FavoriteItem>, String> {
    tokio::task::spawn_blocking(|| {
        let store = load_store()?;
        Ok(store.favorites)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Adds a favorite. If a favorite with the same type + name already exists, it is skipped.
#[tauri::command]
pub async fn add_favorite(
    item_type: String,
    name: String,
    display_name: Option<String>,
    path: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut store = load_store()?;

        // Deduplicate
        let exists = store.favorites.iter().any(|f| f.item_type == item_type && f.name == name);
        if exists {
            return Ok("Already favorited".to_string());
        }

        store.favorites.push(FavoriteItem {
            item_type: item_type.clone(),
            name: name.clone(),
            display_name,
            path,
        });

        save_store(&store)?;
        Ok(format!("Added {} '{}' to favorites", item_type, name))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Removes a favorite by type and name.
#[tauri::command]
pub async fn remove_favorite(item_type: String, name: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut store = load_store()?;
        let before = store.favorites.len();
        store.favorites.retain(|f| !(f.item_type == item_type && f.name == name));
        let removed = before - store.favorites.len();
        save_store(&store)?;
        if removed > 0 {
            Ok(format!("Removed '{}' from favorites", name))
        } else {
            Ok("Favorite not found".to_string())
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
