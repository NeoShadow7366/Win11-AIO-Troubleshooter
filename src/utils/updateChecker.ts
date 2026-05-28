const GITHUB_REPO = "NeoShadow7366/Win11-AIO-Troubleshooter";
const CURRENT_VERSION = "2.1.0";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY = "aio-update-last-check";

export interface UpdateInfo {
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  isNewer: boolean;
}

/**
 * Compare semver strings (e.g. "2.1.0" vs "2.2.0").
 * Returns true if remote > current.
 */
function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const r = parse(remote);
  const c = parse(current);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const rv = r[i] ?? 0;
    const cv = c[i] ?? 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
}

/**
 * Check GitHub for the latest release. Throttled to once per 24 hours
 * using localStorage timestamp. Returns null if no update is available
 * or if the check was throttled/failed.
 */
export async function checkForUpdates(force = false): Promise<UpdateInfo | null> {
  // Throttle checks
  if (!force) {
    try {
      const last = localStorage.getItem(STORAGE_KEY);
      if (last && Date.now() - parseInt(last, 10) < CHECK_INTERVAL_MS) {
        return null; // Already checked recently
      }
    } catch { /* ignore localStorage errors */ }
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const latestVersion = (data.tag_name || "").replace(/^v/, "");
    const downloadUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
    const releaseNotes = data.body || "";

    // Update last-check timestamp
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch { /* ignore */ }

    if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
      return {
        latestVersion,
        downloadUrl,
        releaseNotes,
        isNewer: true,
      };
    }

    return null;
  } catch {
    // Network error — fail silently
    return null;
  }
}
