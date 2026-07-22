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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Version metadata aligned: ${expectedName} (${expectedCode})`);
}
