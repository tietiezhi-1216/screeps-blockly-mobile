package io.github.tietiezhi.lan;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/** 应用内更新：下载 APK（跟随 GitHub 重定向）→ 校验 → 调起系统安装器 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private volatile boolean cancel = false;

    @Override protected void handleOnResume() { notifyListeners("resume", new JSObject()); }

    @PluginMethod public void download(PluginCall call) {
        final String url = call.getString("url");
        final long expectSize = call.getLong("size", -1L);
        final String expectSha = call.getString("sha256", "");
        if (url == null) { call.reject("缺少 url"); return; }
        cancel = false;
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates"); dir.mkdirs();
            File out = new File(dir, "update.apk"), part = new File(dir, "update.apk.part");
            HttpURLConnection c = null;
            try {
                String u = url;
                for (int i = 0; i < 8; i++) { // 手动跟随重定向（github.com → objects.githubusercontent.com）
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "ScreepsBlockly-Updater");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { String loc = c.getHeaderField("Location"); c.disconnect(); if (loc == null) throw new Exception("重定向缺少 Location"); u = new URL(new URL(u), loc).toString(); continue; }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = c.getContentLengthLong(); if (total <= 0) total = expectSize;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long got = 0, lastEmit = 0; byte[] buf = new byte[64 * 1024];
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(part)) {
                    int n; while ((n = in.read(buf)) > 0) {
                        if (cancel) throw new Exception("已取消");
                        fo.write(buf, 0, n); md.update(buf, 0, n); got += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 150) { lastEmit = now; JSObject p = new JSObject(); p.put("received", got); p.put("total", total); notifyListeners("progress", p); }
                    }
                }
                StringBuilder sb = new StringBuilder(); for (byte b : md.digest()) sb.append(String.format("%02x", b));
                String sha = sb.toString();
                if (expectSize > 0 && got != expectSize) throw new Exception("文件大小不符：" + got + " ≠ " + expectSize);
                if (expectSha != null && !expectSha.isEmpty() && !expectSha.equalsIgnoreCase(sha)) throw new Exception("SHA-256 校验失败");
                if (out.exists()) out.delete();
                if (!part.renameTo(out)) throw new Exception("保存失败");
                JSObject p = new JSObject(); p.put("received", got); p.put("total", got); notifyListeners("progress", p);
                JSObject r = new JSObject(); r.put("path", out.getAbsolutePath()); r.put("size", got); r.put("sha256", sha); call.resolve(r);
            } catch (Exception e) { part.delete(); call.reject("下载失败：" + e.getMessage()); }
            finally { if (c != null) c.disconnect(); }
        }).start();
    }

    @PluginMethod public void cancel(PluginCall call) { cancel = true; call.resolve(); }

    @PluginMethod public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject(); r.put("allowed", ok); call.resolve(r);
    }

    @PluginMethod public void openInstallSettings(PluginCall call) {
        try {
            Intent i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); call.resolve();
        } catch (Exception e) { call.reject("无法打开设置：" + e.getMessage()); }
    }

    @PluginMethod public void install(PluginCall call) {
        try {
            File f = new File(call.getString("path", new File(new File(getContext().getCacheDir(), "updates"), "update.apk").getAbsolutePath()));
            if (!f.exists()) { call.reject("安装包不存在"); return; }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".sbmupdate.fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i); call.resolve();
        } catch (Exception e) { call.reject("无法启动安装：" + e.getMessage()); }
    }
}
