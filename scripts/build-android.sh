#!/bin/bash
# 用法：APP_VERSION=1.1.0 VERSION_CODE=110 ./scripts/build-android.sh  → 生成未签名 release APK
set -e
: "${APP_VERSION:?}" "${VERSION_CODE:?}"
./scripts/prepare.sh
rm -rf android
npx cap add android
npx cap sync android
sed -i "s/versionCode 1$/versionCode $VERSION_CODE/; s/versionName \"1.0\"/versionName \"$APP_VERSION\"/" android/app/build.gradle
# 局域网 ws:// 明文连接
sed -i 's/<application/<application android:usesCleartextTraffic="true"/' android/app/src/main/AndroidManifest.xml
grep -E "versionCode|versionName" android/app/build.gradle
(cd android && ./gradlew assembleRelease --no-daemon -q)
