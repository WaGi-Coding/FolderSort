const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 720,
    title: 'FolderSort',
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // <--- WICHTIG: Erlaubt das Laden von file:// Bildern
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

// 1. Ordner auswählen
ipcMain.handle('dialog:open-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) return null;
  return filePaths[0];
});

// 2. Bilder auslesen
ipcMain.handle('dir:read-images', async (_, folderPath) => {
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  try {
    const files = fs.readdirSync(folderPath);
    const images = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (validExtensions.includes(ext)) {
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath);
        
        let exifDate = null;
        try {
          const parsed = await exifr.parse(fullPath, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
          if (parsed) {
            const dateObj = parsed.DateTimeOriginal || parsed.CreateDate || parsed.ModifyDate;
            if (dateObj) exifDate = new Date(dateObj).getTime();
          }
        } catch (e) {
          // Fallback, falls keine EXIF/Metadaten vorhanden sind
        }

        images.push({
          id: file,
          originalName: file,
          extension: ext,
          path: fullPath,
          size: stats.size,
          birthtime: stats.birthtimeMs,
          mtime: stats.mtimeMs,
          exifDate: exifDate || stats.birthtimeMs, 
        });
      }
    }
    return { success: true, images };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 3. Batch-Renaming ausführen
ipcMain.handle('files:rename', async (_, { folderPath, items, prefix, postfix, padding, keepOriginalName }) => {
  try {
    const tempRenames = items.map((item, index) => {
      const numStr = String(index + 1).padStart(padding, '0');
      const originalBaseName = item.originalName.slice(0, -item.extension.length);
      const newFileName = `${prefix}${numStr}${postfix}${keepOriginalName ? originalBaseName : ''}${item.extension}`;
      const oldFullPath = item.path;
      const tempFullPath = path.join(folderPath, `temp_${Date.now()}_${index}${item.extension}`);
      const finalFullPath = path.join(folderPath, newFileName);
      
      return { oldFullPath, tempFullPath, finalFullPath };
    });

    for (const r of tempRenames) {
      fs.renameSync(r.oldFullPath, r.tempFullPath);
    }

    for (const r of tempRenames) {
      fs.renameSync(r.tempFullPath, r.finalFullPath);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});