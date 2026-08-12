import type { ProjectKind } from "./projectDetection";

export const BUILDER_WORKFLOW_PATH = ".github/workflows/build-apk.yml";

export function buildWorkflowYaml() {
  return `name: Build Android APK

on:
  workflow_dispatch:
    inputs:
      project_type:
        description: Detected project type
        required: true
        type: choice
        options: [expo, react-native, flutter, android-native]
      source_path:
        description: ZIP source path committed by APK Builder Hub
        required: true
        default: uploads/project.zip

permissions:
  contents: read

jobs:
  build:
    name: Build \${{ inputs.project_type }} APK
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Unpack uploaded project
        run: |
          mkdir -p workspace artifacts
          unzip -q "\${{ inputs.source_path }}" -d workspace
          ROOT=$(find workspace -mindepth 1 -maxdepth 1 -type d | head -n 1)
          if [ -n "$ROOT" ] && [ "$(find workspace -mindepth 1 -maxdepth 1 | wc -l)" = "1" ]; then
            mv "$ROOT"/* workspace/ 2>/dev/null || true
            mv "$ROOT"/.[!.]* workspace/ 2>/dev/null || true
            rmdir "$ROOT" 2>/dev/null || true
          fi

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Set up Node
        if: inputs.project_type == 'expo' || inputs.project_type == 'react-native'
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: workspace/package-lock.json

      - name: Build Expo APK
        if: inputs.project_type == 'expo'
        working-directory: workspace
        run: |
          npm ci
          npx expo prebuild --platform android --non-interactive
          cd android && ./gradlew assembleRelease
          cp app/build/outputs/apk/release/*.apk ../artifacts/app-unsigned.apk

      - name: Build React Native APK
        if: inputs.project_type == 'react-native'
        working-directory: workspace
        run: |
          npm ci
          cd android && ./gradlew assembleRelease
          cp app/build/outputs/apk/release/*.apk ../artifacts/app-unsigned.apk

      - name: Set up Flutter
        if: inputs.project_type == 'flutter'
        uses: subosito/flutter-action@v2
        with:
          channel: stable

      - name: Build Flutter APK
        if: inputs.project_type == 'flutter'
        working-directory: workspace
        run: |
          flutter pub get
          flutter build apk --release
          cp build/app/outputs/flutter-apk/app-release.apk artifacts/app-unsigned.apk

      - name: Build Android Native APK
        if: inputs.project_type == 'android-native'
        working-directory: workspace
        run: |
          ./gradlew assembleRelease
          find . -path "*/build/outputs/apk/release/*.apk" -type f -exec cp {} artifacts/app-unsigned.apk \;

      - name: Sign APK for installation
        run: |
          test -f artifacts/app-unsigned.apk
          keytool -genkeypair -keystore artifacts/build-session.keystore -storepass build-session -keypass build-session -alias apk-builder -keyalg RSA -keysize 2048 -validity 7 -dname "CN=APK Builder, OU=Build Session, O=APK Builder, L=Internet, ST=Internet, C=US"
          BUILD_TOOLS=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)
          "$BUILD_TOOLS/zipalign" -f -p 4 artifacts/app-unsigned.apk artifacts/app-aligned.apk
          "$BUILD_TOOLS/apksigner" sign --ks artifacts/build-session.keystore --ks-pass pass:build-session --key-pass pass:build-session --ks-key-alias apk-builder --out artifacts/app-release.apk artifacts/app-aligned.apk

      - name: Check APK output
        run: |
          test -f artifacts/app-release.apk
          BUILD_TOOLS=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)
          "$BUILD_TOOLS/apksigner" verify --verbose artifacts/app-release.apk

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: android-apk
          path: artifacts/app-release.apk
          if-no-files-found: error
          retention-days: 7
`;
}

export function buildSourcePath(kind: ProjectKind, timestamp: number) {
  return `uploads/${kind}-${timestamp}.zip`;
}
