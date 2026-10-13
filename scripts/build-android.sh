#!/bin/bash
# 用法：APP_VERSION=1.1.0 VERSION_CODE=110 ./scripts/build-android.sh  → 生成未签名 release APK
set -e
# 自动使用 ~/sdk 下的 JDK 17 与 Android SDK（已设置则沿用）
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then J=$(ls -d "$HOME"/sdk/jdk-17* 2>/dev/null | head -1); [ -n "$J" ] && export JAVA_HOME="$J"; fi
if [ -z "$ANDROID_HOME" ] && [ -d "$HOME/sdk/android" ]; then export ANDROID_HOME="$HOME/sdk/android"; fi
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
[ -n "$JAVA_HOME" ] && export PATH="$JAVA_HOME/bin:$PATH"
[ -n "$ANDROID_HOME" ] && export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
echo "JAVA_HOME=$JAVA_HOME ANDROID_HOME=$ANDROID_HOME"
: "${APP_VERSION:?}" "${VERSION_CODE:?}"
./scripts/prepare.sh
rm -rf android
npx cap add android
npx cap sync android
# 启动图标（scripts/gen-icons.py 生成）
cp -r android-res/. android/app/src/main/res/
rm -f android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml android/app/src/main/res/drawable/ic_launcher_background.xml
# Capacitor CLI 每个包只登记一个插件类，这里补登记同包里的 AppUpdater
node -e "const f='android/app/src/main/assets/capacitor.plugins.json',j=require('./'+f);if(!j.some(p=>p.classpath.endsWith('AppUpdaterPlugin')))j.push({pkg:'capacitor-lan-server',classpath:'io.github.tietiezhi.lan.AppUpdaterPlugin'});require('fs').writeFileSync(f,JSON.stringify(j,null,2))"
sed -i "s/versionCode 1$/versionCode $VERSION_CODE/; s/versionName \"1.0\"/versionName \"$APP_VERSION\"/" android/app/build.gradle
# 固定 WebView 文字缩放为 100%，不受系统字体大小影响
cat > android/app/src/main/java/io/github/tietiezhi/screepsblockly/MainActivity.java <<'JAVA'
package io.github.tietiezhi.screepsblockly;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// 沉浸式全屏：隐藏状态栏与导航栏（从边缘滑动临时呼出），内容延伸到刘海/挖孔区域；回到前台/重新获得焦点时重新隐藏
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().getSettings().setTextZoom(100);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        hideSystemBars();
        // 挖孔/刘海安全区：WebView 的 env(safe-area-inset-*) 经常是 0，这里读原生 DisplayCutout 注入 CSS 变量（横屏两个方向都会重新分发）
        View root = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, ins) -> {
            Insets c = ins.getInsets(WindowInsetsCompat.Type.displayCutout());
            float d = getResources().getDisplayMetrics().density;
            sl = Math.round(c.left / d); sr = Math.round(c.right / d); st = Math.round(c.top / d); sb = Math.round(c.bottom / d);
            pushInsets();
            return ViewCompat.onApplyWindowInsets(v, ins);
        });
        for (int i = 1; i <= 6; i++) root.postDelayed(this::pushInsets, i * 700L);
        // 横屏 180° 翻转不会触发 onConfigurationChanged，监听显示旋转后重新取安全区
        ((android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE)).registerDisplayListener(new android.hardware.display.DisplayManager.DisplayListener() {
            public void onDisplayAdded(int id) {}
            public void onDisplayRemoved(int id) {}
            public void onDisplayChanged(int id) { ViewCompat.requestApplyInsets(root); root.postDelayed(MainActivity.this::pushInsets, 250); }
        }, new android.os.Handler(android.os.Looper.getMainLooper()));
    }

    private int sl, sr, st, sb;
    private void pushInsets() {
        if (getBridge() == null) return; WebView w = getBridge().getWebView(); if (w == null) return;
        String js = "(function(){var s=document.documentElement.style;s.setProperty('--nsal','" + sl + "px');s.setProperty('--nsar','" + sr + "px');s.setProperty('--nsat','" + st + "px');s.setProperty('--nsab','" + sb + "px');window.__cutout={l:" + sl + ",r:" + sr + ",t:" + st + ",b:" + sb + "};window.dispatchEvent(new Event('cutout'));})()";
        w.post(() -> w.evaluateJavascript(js, null));
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration c) { super.onConfigurationChanged(c); View r = getWindow().getDecorView(); ViewCompat.requestApplyInsets(r); r.postDelayed(this::pushInsets, 300); }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onResume() { super.onResume(); hideSystemBars(); pushInsets(); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemBars(); }
}
JAVA
# 局域网 ws:// 明文连接
sed -i 's/<application/<application android:usesCleartextTraffic="true"/' android/app/src/main/AndroidManifest.xml
# 横屏（v1.5.0 起整个应用横屏，随重力在两个横向之间切换）
sed -i "s/<activity/<activity android:screenOrientation=\"sensorLandscape\"/" android/app/src/main/AndroidManifest.xml
# lint 对 BridgeActivity 子类（含匿名监听器）误报 Instantiatable，代码可正常编译运行
printf "\nandroid { lint { disable 'Instantiatable' } }\n" >> android/app/build.gradle
grep -E "versionCode|versionName" android/app/build.gradle
(cd android && ./gradlew assembleRelease --no-daemon -q)
