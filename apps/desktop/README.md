# Desktop (Tauri 2) - Optional

This scaffold focuses on the **cache layer for all file types**:
- Checks API metadata (current_version_id)
- Uses local cache folder by (file_id/version_id)
- Downloads once, reuses instantly if unchanged
- Provides commands to open cached file (default app) + upload a modified local file

## Dev
Run the web app on http://localhost:3000, then:
```bash
cd apps/desktop
npm install
npm run tauri dev
```

## Cache folder
Windows: %LOCALAPPDATA%\WorkshopDesktop\cache\files\<file_id>\<version_id>\<name>
