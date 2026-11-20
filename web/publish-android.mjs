import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const productionSigner = '99a98cee029e3762ea55bf4acd891ab2580b1ead52d9705e919ab1c09badfa0f';
const usage = 'Usage: node web/publish-android.mjs signed.apk [--publish DOWNLOADS_NAMESPACE_ID]';

function buildToolsPath() {
  if (process.env.ANDROID_BUILD_TOOLS) return process.env.ANDROID_BUILD_TOOLS;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Set ANDROID_HOME or ANDROID_BUILD_TOOLS.');
  const directory = path.join(sdk, 'build-tools');
  const installed = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(entry.name))
    .map(entry => entry.name).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  if (!installed.length) throw new Error('Install Android SDK Build Tools.');
  return path.join(directory, installed[0]);
}

function inspectApk(apk) {
  const size = statSync(apk).size;
  if (!size || size > 25 * 1024 * 1024) throw new Error('The APK must be between 1 byte and 25 MiB.');
  const tools = buildToolsPath();
  const badging = execFileSync(path.join(tools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' });
  const application = badging.match(/^package: name='com\.hopetohelp\.ribit' versionCode='([0-9]+)' versionName='([0-9]+\.[0-9]+\.[0-9]+)'/m);
  const sdk = badging.match(/^sdkVersion:'([0-9]+)'/m);
  if (!application || !sdk || Number(application[1]) <= 9) {
    throw new Error('Expected com.hopetohelp.ribit, a numeric three-part version, and versionCode above 9.');
  }

  const signature = execFileSync(path.join(tools, 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8' });
  const signers = [...signature.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})$/gm)];
  if (signers.length !== 1 || signers[0][1] !== productionSigner) {
    throw new Error('The APK must use the same signing certificate as the current public Ribit APK.');
  }
  return { versionCode: Number(application[1]), versionName: application[2], minSdk: Number(sdk[1]), size };
}

try {
  const [file, flag, namespace, ...extra] = process.argv.slice(2);
  if (!file || extra.length || (flag && (flag !== '--publish' || !/^[a-f0-9]{32}$/.test(namespace || '')))) {
    throw new Error(usage);
  }
  const apk = path.resolve(file);
  const release = inspectApk(apk);
  if (flag) {
    const response = await fetch('https://ribit.hopetohelp.net/api/android/latest', {
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Deploy the Android store Worker before publishing an APK.');
    const current = await response.json();
    if (!Number.isInteger(current.versionCode) || release.versionCode <= current.versionCode) {
      throw new Error('The APK versionCode must be higher than the currently published versionCode.');
    }
    const upload = spawnSync('npx', ['wrangler', 'kv', 'key', 'put', 'android-latest.apk',
      '--namespace-id', namespace, '--remote', '--path', apk, '--metadata', JSON.stringify(release)],
    { stdio: 'inherit' });
    if (upload.error) throw upload.error;
    if (upload.status !== 0) throw new Error('The Android release upload failed.');
  }
  console.log(JSON.stringify(release));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
