import * as flashpoint from 'flashpoint-launcher';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { fips } from 'crypto';

type AssetFile = {
  name: string;
  url: string;
  publishedAt: string;
}

const flashPaths = [
  'FPSoftware\\Flash\\flashplayer_32_sa.exe',
  'FPSoftware\\Flash\\6r21\\SAFlashPlayer.exe',
  'FPSoftware\\Flash\\6r4\\SAFlashPlayer.exe',
  'FPSoftware\\Flash\\7r14\\SAFlashPlayer.exe',
  'FPSoftware\\Flash\\8r22\\SAFlashPlayer.exe',
  'FPSoftware\\Flash\\9r16\\SAFlashPlayer.exe',
  'FPSoftware\\Flash\\flashplayer11_9r900_152_win_sa_debug.exe',
  'FPSoftware\\Flash\\flashplayer14_0r0_179_win_sa.exe',
  'FPSoftware\\Flash\\flashplayer19_0r0_245_sa.exe',
  'FPSoftware\\Flash\\flashplayer27_0r0_187_win_sa.exe',
  'FPSoftware\\Flash\\flashplayer9r277_win_sa.exe',
  'FPSoftware\\Flash\\flashplayer_10_3r183_90_win_sa.exe',
  'FPSoftware\\Flash\\flashplayer_32_sa.exe',
  'FPSoftware\\Flash\\flashplayer_7_sa.exe'
];

export async function activate(context: flashpoint.ExtensionContext) {
  const registerSub = (d: flashpoint.Disposable) => { flashpoint.registerDisposable(context.subscriptions, d)};
  const ruffleWebDir = path.join(flashpoint.extensionPath, 'static', 'ruffle');
  const ruffleStandaloneDir = path.join(flashpoint.extensionPath, 'ruffle-standalone');

  const downloadFile = async (url: string, filePath: string): Promise<void> => {
    const file = fs.createWriteStream(filePath);
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Flashpoint Launcher/Ruffle Extension' },
      responseType: 'stream'
    });
    if (res.status != 200) {
      throw new Error(`Status: ${res.status}`);
    }
    res.data.pipe(file);
    return new Promise<void>((resolve, reject) => {
      file.on('finish', resolve);
      file.on('error', reject);
    });
  };

  const downloadJson = async (url: string): Promise<any> => {
    const res = await axios.get(url, { 
      headers: { 'User-Agent': 'Flashpoint Launcher/Ruffle Extension' },
      responseType: 'json'});
    if (res.status != 200) {
      throw new Error(`Status: ${res.status}`);
    }
    return res.data;
  };

  const getGithubAsset = async (nameRegex: RegExp, logDev: (text: string) => void): Promise<AssetFile> => {
    const releasesUrl = 'https://api.github.com/repos/ruffle-rs/ruffle/releases';
    logDev(`Fetching Release from ${releasesUrl}`);
    const releasesJson = await downloadJson(releasesUrl);
    if (!Array.isArray(releasesJson)) {
      throw new Error(`Failed to fetch releases - ${releasesJson['message'] || 'No Message Given'}`)
    }
    if (releasesJson.length === 0) {
      throw new Error(`Repo has no releases.`);
    }
    const latestRelease = releasesJson[0];
    logDev(`Found Release\n  ID: ${latestRelease['id']}\n  Name: ${latestRelease['name']}\n  Published: ${latestRelease['published_at']}`)    
    const assetsUrl = latestRelease['assets_url'];
    logDev(`Fetching Assets from ${assetsUrl}`);
    const assetsJson = await downloadJson(assetsUrl);
    const assets: AssetFile[] = assetsJson.map((asset: any) => {
      return {
        name: asset['name'],
        url: asset['browser_download_url'],
        publishedAt: latestRelease['published_at']
      }
    });
    for (const asset of assets) {
      if (nameRegex.test(asset.name)) {
        return asset;
      }
    }
  };

  const downloadRuffleStandalone = async (assetFile: AssetFile, logDev: (text: string) => void) => {
    fs.rmdirSync(ruffleStandaloneDir, { recursive: true });
    await fs.promises.mkdir(ruffleStandaloneDir)
    const filePath = path.join(ruffleStandaloneDir, assetFile.name);
    logDev(`Found Asset \n  Name: ${assetFile.name}\n  Url: ${assetFile.url}`);
    await downloadFile(assetFile.url, filePath);
    logDev(`Asset downloaded, unpacking into ${path.relative(flashpoint.config.flashpointPath, ruffleStandaloneDir)}`);
    await flashpoint.unzipFile(filePath, ruffleStandaloneDir, { onData: dataPrintFactory(logDev) });
    await fs.promises.unlink(filePath);
    if (filePath.endsWith('.tar.gz')) {
      // Extract .tar if present
      const tarPath = filePath.substring(0, filePath.length - 3);
      await flashpoint.unzipFile(tarPath, ruffleStandaloneDir, { onData: dataPrintFactory(logDev) });
      await fs.promises.unlink(tarPath);
    }
    flashpoint.setExtConfigValue('com.ruffle.standalone_version', assetFile.publishedAt);
  };

  const downloadRuffleWeb = async (assetFile: AssetFile, logDev: (text: string) => void) => {
    fs.rmdirSync(ruffleWebDir, { recursive: true });
    await fs.promises.mkdir(ruffleWebDir)
    const filePath = path.join(ruffleWebDir, assetFile.name);
    logDev(`Found Asset \n  Name: ${assetFile.name}\n  Url: ${assetFile.url}`);
    await downloadFile(assetFile.url, filePath);
    logDev(`Asset downloaded, unpacking into ${path.relative(flashpoint.config.flashpointPath, ruffleWebDir)}`);
    await flashpoint.unzipFile(filePath, ruffleWebDir, { onData: dataPrintFactory(logDev) });
    await fs.promises.unlink(filePath);
    if (filePath.endsWith('.tar.gz')) {
      // Extract .tar if present
      const tarPath = filePath.substring(0, filePath.length - 3);
      await flashpoint.unzipFile(tarPath, ruffleWebDir, { onData: dataPrintFactory(logDev) });
      await fs.promises.unlink(tarPath);
    }
    flashpoint.setExtConfigValue('com.ruffle.web_version', assetFile.publishedAt);
  };

  if (!flashpoint.getExtConfigValue('com.ruffle.first_run_complete')) {
    const connectListener = flashpoint.onDidConnect(async () => {
      const res = await flashpoint.dialogs.showMessageBox({
        title: 'First Run Ruffle',
        message: 'Looks like you haven\'t run the Ruffle extension before.\n' +
          'Would you like to add app overrides from Flash to Ruffle Standalone or Web?',
        buttons: ['Standalone', 'Web', 'None', 'Cancel'],
        cancelId: 3
      });
      if (res <= 1) {
        const override = res === 0 ? ':ruffle:' : ':ruffle-web:';
        // Add app path overrides
        const appPathOverrides = flashpoint.getPreferences().appPathOverrides;
        for (const path of flashPaths) {
          if (!appPathOverrides.find(o => o.path === path)) {
            const newOverride: flashpoint.AppPathOverride = {
              path,
              override
            };
            appPathOverrides.push(newOverride);
          }
        }
        flashpoint.overwritePreferenceData({ appPathOverrides });
      }
      flashpoint.setExtConfigValue('com.ruffle.first_run_complete', true);
      flashpoint.dispose(connectListener);
    });
    flashpoint.registerDisposable(connectListener, context.subscriptions);
  }

  // Check for Standalone updates
  const logVoid = () => {};
  const standaloneAssetFile = await getGithubAsset(getPlatformRegex(), logVoid);
  const standalonePublishedAt = Date.parse(standaloneAssetFile.publishedAt);
  const rawLastStandaloneUpdate = flashpoint.getExtConfigValue('com.ruffle.standalone_version');
  const lastStandaloneUpdate = rawLastStandaloneUpdate ? Date.parse(rawLastStandaloneUpdate) : 0;
  if (standalonePublishedAt > lastStandaloneUpdate) {
    flashpoint.log.info(`Found Ruffle Standalone Update for ${standaloneAssetFile.publishedAt}, downloading...`);
    downloadRuffleStandalone(standaloneAssetFile, logVoid);
    flashpoint.log.info("Found Ruffle Standalone Update Downloaded!");

  }  

  // Check for Web updates
  const webAssetFile = await getGithubAsset(/.*selfhosted\.zip/, logVoid);
  const webPublishedAt = Date.parse(webAssetFile.publishedAt);
  const rawLastWebUpdate = flashpoint.getExtConfigValue('com.ruffle.web_version');
  const lastWebUpdate = rawLastWebUpdate ? Date.parse(rawLastWebUpdate) : 0;
  if (webPublishedAt > lastWebUpdate) {
    flashpoint.log.info(`Found Ruffle Web Update for ${webAssetFile.publishedAt}, downloading...`);
    downloadRuffleWeb(webAssetFile, logVoid);
    flashpoint.log.info("Found Ruffle Web Update Downloaded!");
  }

  registerSub(
    flashpoint.commands.registerCommand('ruffle.download-ruffle-web', async () => {
      const logDev = logDevFactory('Downloading Ruffle Web...')
      const webAssetFile = await getGithubAsset(/.*selfhosted\.zip/, logDev);
      downloadRuffleWeb(webAssetFile, logDev)
      .then(() => {
        logDev('Successfully downloaded Ruffle Web!');
      })
      .catch((err) => {
        logDev(`Failed to download Ruffle Web\n  Error: ${err}`);
      });
    })
  );

  registerSub(
    flashpoint.commands.registerCommand('ruffle.download-ruffle-standalone', async () => {
      const logDev = logDevFactory('Downloading Ruffle Standalone...')
      const standaloneAssetFile = await getGithubAsset(getPlatformRegex(), logDev);
      downloadRuffleStandalone(standaloneAssetFile, logDev)
      .then(() => {
        logDev('Successfully downloaded Ruffle Standalone!');
      })
      .catch((err) => {
        logDev(`Failed to download Ruffle Standalone\n  Error: ${err}`);
      });
    })
  );
}

function logDevFactory(text: string = '') {
  return (newText: string) => {
    text += `\n${newText}`;
    flashpoint.status.setStatus('devConsole', text);
  };
}

function dataPrintFactory(logFunc: (val: string) => void) {
  return (data: flashpoint.ZipData) => {
    if (data.status === 'extracted') { logFunc(`  Extracted ${data.file}`); }
  }
}

function getPlatformRegex(): RegExp {
  switch (process.platform) {
    case 'win32':
      return /.*windows\.zip/;
    case 'linux':
      return /.*linux\.tar\.gz/;
    case 'darwin':
      return /.*osx\.tar\.gz/;
    default:
      throw new Error('Operating System not supported by Ruffle.');
  }
}