# Compilación nativa: macOS (.dmg) e iOS (.ipa) con Tauri v2

La app web (Next.js, export estático en `out/`) se empaqueta con **Tauri v2**. El mismo código
genera el `.dmg` de macOS y el `.ipa` de iOS. La compilación para Apple **requiere un Mac con Xcode**.

## 1. Requisitos (Mac)

| Herramienta | Versión | Instalación |
|---|---|---|
| macOS | 13+ (Apple Silicon o Intel) | — |
| Xcode | 15+ (con iOS SDK) | App Store → luego `sudo xcode-select -s /Applications/Xcode.app` y `xcodebuild -runFirstLaunch` |
| Command Line Tools | — | `xcode-select --install` |
| Node.js | 22 LTS | `brew install node@22` |
| pnpm | 10 | `corepack enable && corepack prepare pnpm@10 --activate` |
| Rust | stable ≥ 1.77 | `curl https://sh.rustup.rs -sSf \| sh` |
| Targets Rust | — | `rustup target add aarch64-apple-darwin x86_64-apple-darwin aarch64-apple-ios aarch64-apple-ios-sim` |
| CocoaPods | 1.15+ | `brew install cocoapods` (lo usa `tauri ios init`) |

```bash
pnpm install          # también copia public/zxing_reader.wasm (postinstall)
cp .env.example .env.local   # completar NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
```

> Las variables `NEXT_PUBLIC_*` se incrustan en el bundle durante `pnpm build`; deben existir al compilar.

## 2. macOS → `.dmg`

```bash
pnpm tauri:dev        # ventana nativa con hot reload (http://localhost:3002)
pnpm build:dmg        # = tauri build --bundles dmg
# Universal (Intel + Apple Silicon):
pnpm tauri build --target universal-apple-darwin --bundles dmg
```

Salida: `src-tauri/target/release/bundle/dmg/Gestor Store_1.0.0_aarch64.dmg`
(o `target/universal-apple-darwin/...` para universal).

### Firma y notarización (distribución fuera del App Store)

1. En <https://developer.apple.com/account/resources/certificates> crea un certificado **Developer ID Application** e instálalo en el Llavero.
2. Identidad: `security find-identity -v -p codesigning` → `Developer ID Application: Tu Nombre (TEAMID)`.
3. Variables antes de `pnpm build:dmg`:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Tu Nombre (TEAMID)"
# Notarización (App Store Connect → Users and Access → Keys) — recomendado:
export APPLE_API_ISSUER="<issuer-uuid>"
export APPLE_API_KEY="<key-id>"
export APPLE_API_KEY_PATH="$HOME/private_keys/AuthKey_<key-id>.p8"
# Alternativa con Apple ID:
# export APPLE_ID="tu@correo.com" APPLE_PASSWORD="<app-specific-password>" APPLE_TEAM_ID="TEAMID"
```

Tauri firma con *hardened runtime* + `src-tauri/Entitlements.plist` (sandbox, red, cámara,
archivos elegidos por el usuario) y notariza automáticamente. Sin identidad el `.dmg` se genera
igualmente sin firmar (útil para pruebas: clic derecho → Abrir).

La cámara en macOS usa `getUserMedia` de WKWebView → AVFoundation; el permiso lo pide macOS con el
texto de `NSCameraUsageDescription` (`src-tauri/Info.plist`).

## 3. iOS → `.ipa`

### 3.1 Cuenta y firma (una sola vez)

1. **Apple Developer Program** (99 USD/año) → anota tu **Team ID** (Membership).
2. Registra el **App ID** `com.gestorstore.app` (Identifiers). Si cambias el identificador, edita `identifier` en `src-tauri/tauri.conf.json`.
3. Certificados: **Apple Development** (pruebas) y **Apple Distribution** (App Store/TestFlight/Ad Hoc).
4. Perfiles de aprovisionamiento (Profiles):
   - *iOS App Development* → dispositivos registrados (UDID), para depurar.
   - *Ad Hoc* → instalar el `.ipa` en iPhones registrados sin App Store.
   - *App Store* → TestFlight / App Store.
   Con firma automática de Xcode (recomendado) los perfiles se crean solos.

### 3.2 Generar el proyecto Xcode

```bash
export APPLE_DEVELOPMENT_TEAM=TEAMID
pnpm ios:init                 # = tauri ios init → crea src-tauri/gen/apple (proyecto Xcode)
```

Después de `ios:init` añade al `Info.plist` de iOS (`src-tauri/gen/apple/gestor-store_iOS/Info.plist`)
la clave de cámara (la toma de `src-tauri/Info.plist`; verifica que esté):

```xml
<key>NSCameraUsageDescription</key>
<string>Gestor Store usa la cámara para escanear códigos QR y de barras de los productos.</string>
```

### 3.3 Ejecutar y compilar

```bash
pnpm tauri ios dev                       # simulador (la cámara no existe en el simulador)
pnpm tauri ios dev --host                # iPhone físico conectado (misma red)
pnpm tauri ios open                      # abrir en Xcode (Signing & Capabilities → Team)

# .ipa
pnpm build:ios                           # = tauri ios build --export-method app-store-connect
pnpm tauri ios build --export-method release-testing   # Ad Hoc
pnpm tauri ios build --export-method debugging         # Development
```

Salida: `src-tauri/gen/apple/build/arm64/Gestor Store.ipa`.

Subir a TestFlight:
```bash
xcrun altool --upload-app --type ios --file "src-tauri/gen/apple/build/arm64/Gestor Store.ipa" \
  --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
```

### 3.4 Firma manual en CI

Para CI (sin Xcode interactivo) exporta el certificado `.p12` y el perfil `.mobileprovision`:

```bash
export IOS_CERTIFICATE="$(base64 -i distribution.p12)"
export IOS_CERTIFICATE_PASSWORD="..."
export IOS_MOBILE_PROVISION="$(base64 -i GestorStore_AppStore.mobileprovision)"
pnpm build:ios
```

Ver `.github/workflows/native-build.yml` (macOS runner) que usa estos mismos secretos.

## 4. Escáner ultra-rápido

| Plataforma | Motor | Dónde corre |
|---|---|---|
| iOS (app) | `tauri-plugin-barcode-scanner` → `AVCaptureMetadataOutput` (detección por hardware/Vision) | Pipeline nativo de la cámara |
| macOS (app) / navegador | `BarcodeDetector` si existe; si no **ZXing-C++ → WebAssembly** | Web Worker (fuera del hilo de UI) |

- Cada frame (`requestVideoFrameCallback`) se recorta a la zona guía y se reduce a ≤960 px, se transfiere sin copia al worker y se decodifica (típicamente 3–15 ms en Apple Silicon). Nunca hay más de un frame en vuelo.
- El WASM (`public/zxing_reader.wasm`) se sirve localmente → funciona sin internet, y se precarga al abrir la cámara.
- **Cámara**: lectura única. **Continuo** (Kiosko): la cámara sigue abierta, cada código distinto se agrega al carrito al instante (anti-rebote de 1,5 s para el mismo código), con pitido/vibración y contador de ms por frame.

Código: `lib/scanner/*`, `components/barcode-scanner-dialog.tsx`.

## 5. Estructura

```
src-tauri/
  Cargo.toml            plugins: sql(sqlite), dialog, fs, barcode-scanner (móvil)
  tauri.conf.json       bundle dmg, CSP, minimumSystemVersion
  capabilities/         permisos (desktop / mobile)
  Info.plist            NSCameraUsageDescription
  Entitlements.plist    sandbox + red + cámara + archivos
  icons/                generados con `pnpm tauri icon public/icon.svg`
```
