import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { mkdir, access, writeFile, rm } from 'fs/promises';
import { execFile } from 'child_process';

const exists = path => access(path).then(() => true).catch(() => false);

const version = `108.0.5359.125`;
const naclArch = (() => {
  if (process.arch.startsWith('arm')) return 'arm';
  if (process.arch === 'ia32') return 'x86-32';

  return 'x86-64';
})();

const configDir = (() => {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA, 'gluon', 'devtools-extensions');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'gluon', 'devtools-extensions');
  return join((process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')), 'gluon', 'devtools-extensions');
})();

const downloadCrxAsZip = async (url, path) => {
  const arraybuffer = await (await fetch(url)).arrayBuffer();
  const uint = new Uint8Array(arraybuffer);

  let zipStartOffset;
  if (uint[4] === 2) {
    zipStartOffset = 16 +
      (uint[8] + (uint[9] << 8) + (uint[10] << 16) + (uint[11] << 24)) +
      (uint[12] + (uint[13] << 8) + (uint[14] << 16) + (uint[15] << 24));
  } else {
    zipStartOffset = 12 +
      (uint[8] + (uint[9] << 8) + (uint[10] << 16) + (uint[11] << 24 >>> 0));
  }

  await writeFile(path, Buffer.from(new Uint8Array(arraybuffer, zipStartOffset)));
};

const downloadFile = async (url, path) => {
  await writeFile(path, Buffer.from(new Uint8Array(await (await fetch(url)).arrayBuffer())));
};

const unzip = async (zipPath, extractPath) => {
  await mkdir(extractPath, { recursive: true });

  let extractFailed;
  if (process.platform === 'win32') {
    extractFailed = await new Promise(res => execFile(`C:\\Windows\\System32\\tar.exe`, [ '-xf', zipPath, '-C', extractPath ], (err, a, b) => res(!!err)));
  } else {
    extractFailed = await new Promise(res => execFile(`bsdtar`, [ '-xf', zipPath, '-C', extractPath ], err => res(!!err)));
    if (extractFailed) extractFailed = await new Promise(res => execFile(`unzip`, [ zipPath, '-d', extractPath ], err => res(!!err)));
  }

  if (extractFailed) {
    console.warn(`gluon/devtools: failed to extract (${zipPath} -> ${extractPath})`);
    return false;
  }

  return true;
};

const downloadChromium = async id => {
  const tmpFile = join(tmpdir(), id + '.zip');
  const finalDir = join(configDir, id);

  if (await exists(finalDir)) return finalDir;

  console.log(`gluon/devtools: downloading extension... (${id} -> ${tmpFile})`);

  await downloadCrxAsZip(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${version}&x=id%3D${id}%26installsource%3Dondemand%26uc&nacl_arch=${naclArch}&acceptformat=crx2,crx3`, tmpFile);

  console.log(`gluon/devtools: extracting extension... (${finalDir})`);

  const extracted = await unzip(tmpFile, finalDir);
  if (!extracted) return false;

  await rm(tmpFile, { force: true });

  return finalDir;
};

const downloadFirefox = async (storeId, xpiId) => {
  if (!storeId) return undefined;

  const finalPath = join(configDir, xpiId + '.xpi');
  if (await exists(finalPath)) return finalPath;

  console.log(`gluon/devtools: downloading extension... (${storeId} -> ${finalPath})`);

  await downloadFile(
    `https://addons.mozilla.org/firefox/downloads/latest/${storeId}/addon-${storeId}-latest.xpi`,
    finalPath
  );

  return finalPath;
};

const setup = (chromeId, firefoxStoreId, firefoxXpiId) => ({
  chromium: downloadChromium(chromeId),
  firefox: downloadFirefox(firefoxStoreId, firefoxXpiId)
});

export const REACT_DEVTOOLS = () => setup('fmkadmapgofadopljbjfkapdkoienihi', 'react-devtools', '@react-devtools');