const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createHash } = require('crypto');
const { spawn } = require('child_process');
const exifr = require('exifr');

let mainWindow;
let updateCheckInProgress = false;

const githubLatestReleaseUrl = 'https://api.github.com/repos/WaGi-Coding/FolderSort/releases/latest';

function sendUpdateStatus(status, message, progress) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:status', { status, message, progress });
  }
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unsupported release tag: ${version}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function getLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.get(githubLatestReleaseUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FolderSort' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub latest-release check failed (HTTP ${response.statusCode}).`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('GitHub returned invalid release data.'));
        }
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('GitHub release check timed out.')));
    request.on('error', reject);
  });
}

function downloadInstaller(asset, destination) {
  return new Promise((resolve, reject) => {
    const assetUrl = new URL(asset.browser_download_url);
    if (assetUrl.protocol !== 'https:' || assetUrl.hostname !== 'github.com') {
      reject(new Error('The release installer URL is not a trusted GitHub URL.'));
      return;
    }

    const request = (url, redirectCount = 0) => {
      const currentUrl = new URL(url);
      if (currentUrl.protocol !== 'https:' || redirectCount > 5) {
        reject(new Error('The installer download redirect is invalid.'));
        return;
      }

      const downloadRequest = https.get(currentUrl, { headers: { 'User-Agent': 'FolderSort' } }, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          const nextUrl = new URL(response.headers.location, currentUrl);
          response.resume();
          request(nextUrl.href, redirectCount + 1);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Installer download failed (HTTP ${response.statusCode}).`));
          return;
        }

        const output = fs.createWriteStream(destination);
        const hash = createHash('sha256');
        const totalBytes = Number(response.headers['content-length'] || asset.size || 0);
        let downloadedBytes = 0;
        let lastPercent = -1;
        response.on('data', (chunk) => {
          hash.update(chunk);
          downloadedBytes += chunk.length;
          const percent = totalBytes ? Math.floor((downloadedBytes / totalBytes) * 100) : 0;
          if (percent !== lastPercent) {
            lastPercent = percent;
            sendUpdateStatus('downloading', `Downloading update: ${percent}%`, percent);
          }
        });
        response.on('error', reject);
        output.on('error', reject);
        output.on('finish', () => output.close(() => {
          const expectedDigest = /^sha256:(.+)$/i.exec(asset.digest || '')?.[1];
          const actualDigest = hash.digest('hex');
          if (expectedDigest && actualDigest.toLowerCase() !== expectedDigest.toLowerCase()) {
            reject(new Error('The downloaded installer failed its SHA-256 integrity check.'));
            return;
          }
          resolve();
        }));
        response.pipe(output);
      });
      downloadRequest.setTimeout(60000, () => downloadRequest.destroy(new Error('Installer download timed out.')));
      downloadRequest.on('error', reject);
    };

    request(assetUrl.href);
  });
}

function launchInstallerAfterExit(installerPath) {
  return new Promise((resolve, reject) => {
    const processId = process.pid;
    const scriptPath = path.join(path.dirname(installerPath), `install-update-${processId}.vbs`);
    const escapedInstallerPath = installerPath.replace(/"/g, '""');
    const script = [
      'Set shell = CreateObject("WScript.Shell")',
      'Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")',
      `processId = ${processId}`,
      'For attempt = 1 To 60',
      '  Set processes = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE ProcessId = " & processId)',
      '  If processes.Count = 0 Then Exit For',
      '  WScript.Sleep 500',
      'Next',
      `shell.Run """${escapedInstallerPath}""", 1, False`,
      'CreateObject("Scripting.FileSystemObject").DeleteFile WScript.ScriptFullName, True',
      '',
    ].join('\r\n');

    fs.writeFileSync(scriptPath, script, 'ascii');
    const launcher = spawn('wscript.exe', ['//B', '//NoLogo', scriptPath], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    launcher.once('error', (error) => {
      fs.rmSync(scriptPath, { force: true });
      reject(error);
    });
    launcher.once('spawn', () => {
      launcher.unref();
      resolve();
    });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) return { success: false, error: 'Update checks are available in the installed app.' };
  if (process.platform !== 'win32') return { success: false, error: 'Updates are currently available for Windows only.' };
  if (updateCheckInProgress) return { success: true };

  updateCheckInProgress = true;
  try {
    sendUpdateStatus('checking', 'Checking GitHub for updates...');
    const release = await getLatestRelease();
    const latestVersion = release.tag_name;
    if (compareVersions(latestVersion, app.getVersion()) <= 0) {
      sendUpdateStatus('current', `FolderSort v${app.getVersion()} is up to date.`);
      return { success: true };
    }

    const installerName = `FolderSort.Setup.${latestVersion}.exe`;
    const installerAsset = release.assets?.find((asset) => asset.name === installerName);
    if (!installerAsset) {
      throw new Error(`Release ${latestVersion} has no ${installerName} asset.`);
    }

    sendUpdateStatus('available', `Update v${latestVersion} found. Downloading...`);
    const updateDirectory = path.join(app.getPath('temp'), 'FolderSort', 'updates');
    fs.mkdirSync(updateDirectory, { recursive: true });
    const installerPath = path.join(updateDirectory, installerName);
    await downloadInstaller(installerAsset, installerPath);
    sendUpdateStatus('installing', `Installing v${latestVersion}. FolderSort will close first.`);
    await launchInstallerAfterExit(installerPath);
    app.quit();
    return { success: true, updateAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message.split(/\r?\n/)[0] : String(error);
    sendUpdateStatus('error', `Update check failed: ${message}`);
    return { success: false, error: message };
  } finally {
    updateCheckInProgress = false;
  }
}

function createWindow() {
  const windowTitle = `FolderSort - v${app.getVersion()}`;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 720,
    title: windowTitle,
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // <--- WICHTIG: Erlaubt das Laden von file:// Bildern
    },
  });
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.once('did-finish-load', () => mainWindow.setTitle(windowTitle));

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

ipcMain.handle('updates:check', async () => {
  return checkForUpdates();
});

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
        } catch {
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
      let originalBaseName = item.originalName.slice(0, -item.extension.length);
      if (prefix && originalBaseName.startsWith(prefix)) {
        const number = originalBaseName.slice(prefix.length).match(/^\d+/)?.[0];
        if (number) {
          const remainder = originalBaseName.slice(prefix.length + number.length);
          if (!postfix || remainder.length === 0 || remainder.startsWith(postfix)) {
            originalBaseName = remainder.startsWith(postfix) ? remainder.slice(postfix.length) : remainder;
          }
        }
      }
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