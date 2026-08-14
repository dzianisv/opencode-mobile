import { readFile } from "node:fs/promises";

const app = JSON.parse(await readFile("app.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const gradle = await readFile("android/app/build.gradle", "utf8");

const name = gradle.match(/^\s*versionName\s+"([^"]+)"/m)?.[1];
const code = Number(gradle.match(/^\s*versionCode\s+(\d+)/m)?.[1]);
const expectedName = app.expo.version;
const expectedCode = app.expo.android.versionCode;

const errors = [];

if (pkg.version !== expectedName) {
  errors.push(`package.json version ${pkg.version} != app.json version ${expectedName}`);
}

if (name !== expectedName) {
  errors.push(`Gradle versionName ${name ?? "missing"} != app.json version ${expectedName}`);
}

if (code !== expectedCode) {
  errors.push(`Gradle versionCode ${Number.isNaN(code) ? "missing" : code} != app.json versionCode ${expectedCode}`);
}

// A versionCode left at the previous release's value is the silent half of this
// failure: version metadata is internally consistent, Play still accepts the
// upload (CI overrides the code with run_number+100), but the F-Droid repo and
// every direct-APK install key upgrades off versionCode — so a 0.4.15 APK
// carrying 0.4.14's code is never offered to the cohort it was cut for.
// The changelog file is named after the versionCode and its first line names
// the version, so requiring the two to agree pins the code to this release.
const changelogPath = `distribution/changelogs/${expectedCode}.txt`;
let changelog = null;
try {
  changelog = await readFile(changelogPath, "utf8");
} catch {
  errors.push(`${changelogPath} is missing — every release needs a changelog named after its versionCode`);
}

if (changelog !== null) {
  const firstLine = changelog.split("\n", 1)[0].trim();
  if (!firstLine.startsWith(`v${expectedName}`)) {
    errors.push(
      `${changelogPath} describes "${firstLine}", not v${expectedName} — versionCode ${expectedCode} belongs to an earlier release, so bump it`,
    );
  }
}

const fastlanePath = `fastlane/metadata/android/en-US/changelogs/${expectedCode}.txt`;
try {
  await readFile(fastlanePath, "utf8");
} catch {
  errors.push(`${fastlanePath} is missing — F-Droid reads its release notes from here`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Version metadata aligned: ${expectedName} (${expectedCode})`);
}
