# Signing Key Fingerprints — opencode-mobile

All distribution channels (Google Play, F-Droid, IzzyOnDroid) use the same
signing key. This allows users to update in-place across stores.

Keystore: `keystores/production-release.jks`
Key alias: (see Bitwarden item `KEYSTORE_INFO` in project folder `opencode-mobile`)

---

## SHA-256 Certificate Fingerprint

**Colon-separated (keytool / apksigner display format):**

```
0C:25:9D:94:E0:FF:EA:5D:63:19:61:4B:22:9D:...:DF:6A:A0:99
```

Full value (for file reference only — middle bytes intentionally omitted in reports):
```
0C:25:9D:94:E0:FF:EA:5D:63:19:61:4B:22:9D:4B:6B:DC:22:DE:1F:56:E3:8E:76:94:83:98:D2:DF:6A:A0:99
```

**Lowercase without colons (F-Droid `AllowedAPKSigningKeys` format):**

```
0c259d94e0ffea5d6319614b229d4b6bdc22de1f56e38e769483 98d2df6aa099
```

(Remove the space — it is split here only for readability.)

---

## How to verify

```bash
# From keystore
keytool -list -v \
  -keystore keystores/production-release.jks \
  -storepass <STOREPASS> \
  | grep "SHA256:"

# From a signed APK
apksigner verify --print-certs path/to/app-release.apk | grep SHA-256
```

---

## Usage in submissions

| Channel | Format needed | Location |
|---------|--------------|----------|
| F-Droid `AllowedAPKSigningKeys` | lowercase hex, no colons | `distribution/fdroid-submission/metadata.yml` |
| IzzyOnDroid inclusion request | colon-separated | `distribution/izzyondroid-submission/INCLUSION-REQUEST.md` |
| Google Play App Signing | uploaded via console | (Play manages separately if App Signing enabled) |

---

## Key backup

The keystore is gitignored. Backup location: Bitwarden project folder `opencode-mobile`,
item `KEYSTORE_PRODUCTION_JKS`. Keep a second offline backup.

**Never commit the keystore or its password to git.**
