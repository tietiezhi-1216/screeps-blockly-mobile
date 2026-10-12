#!/bin/bash
# 用法：APP_VERSION=1.1.0 VERSION_CODE=110 ./scripts/build-android.sh  → 生成未签名 release APK
set -e
: "${APP_VERSION:?}" "${VERSION_CODE:?}"
./scripts/prepare.sh
rm -rf android
npx cap add android
npx cap sync android
# Capacitor CLI 每个包只登记一个插件类，这里补登记同包里的 AppUpdater
node -e "const f='android/app/src/main/assets/capacitor.plugins.json',j=require('./'+f);if(!j.some(p=>p.classpath.endsWith('AppUpdaterPlugin')))j.push({pkg:'capacitor-lan-server',classpath:'io.github.tietiezhi.lan.AppUpdaterPlugin'});require('fs').writeFileSync(f,JSON.stringify(j,null,2))"
sed -i "s/versionCode 1$/versionCode $VERSION_CODE/; s/versionName \"1.0\"/versionName \"$APP_VERSION\"/" android/app/build.gradle
# 固定 WebView 文字缩放为 100%，不受系统字体大小影响
cat > android/app/src/main/java/io/github/tietiezhi/screepsblockly/MainActivity.java <<'JAVA'
package io.github.tietiezhi.screepsblockly;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
JAVA
# 局域网 ws:// 明文连接
sed -i 's/<application/<application android:usesCleartextTraffic="true"/' android/app/src/main/AndroidManifest.xml
grep -E "versionCode|versionName" android/app/build.gradle
(cd android && ./gradlew assembleRelease --no-daemon -q)
