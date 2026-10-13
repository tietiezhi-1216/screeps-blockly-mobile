package io.github.tietiezhi.lan;

import android.content.Context;
import android.net.wifi.WifiManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;
import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "LanServer")
public class LanServerPlugin extends Plugin {
    static final int BEACON_PORT = 8788;
    private Server server;
    private Thread beacon;
    private volatile boolean beaconOn = false;
    private final Map<Integer, Sock> socks = new ConcurrentHashMap<>();
    private final AtomicInteger ids = new AtomicInteger(1);

    class Sock extends NanoWSD.WebSocket {
        int id;
        Sock(NanoHTTPD.IHTTPSession h) { super(h); id = ids.getAndIncrement(); }
        @Override protected void onOpen() { socks.put(id, this); JSObject o = new JSObject(); o.put("id", id); notifyListeners("connect", o); }
        @Override protected void onClose(NanoWSD.WebSocketFrame.CloseCode c, String r, boolean b) { socks.remove(id); JSObject o = new JSObject(); o.put("id", id); notifyListeners("close", o); }
        @Override protected void onMessage(NanoWSD.WebSocketFrame f) { JSObject o = new JSObject(); o.put("id", id); o.put("data", f.getTextPayload()); notifyListeners("message", o); }
        @Override protected void onPong(NanoWSD.WebSocketFrame f) {}
        @Override protected void onException(IOException e) {}
    }
    class Server extends NanoWSD {
        Server(int port) { super(port); }
        @Override protected NanoWSD.WebSocket openWebSocket(NanoHTTPD.IHTTPSession h) { return new Sock(h); }
    }

    static List<String[]> ipv4() { // [ip, broadcast]
        List<String[]> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getAddress() instanceof Inet4Address) out.add(new String[]{ia.getAddress().getHostAddress(), ia.getBroadcast() == null ? null : ia.getBroadcast().getHostAddress()});
                }
            }
        } catch (Exception ignored) {}
        return out;
    }
    static JSArray ipArray() { JSArray a = new JSArray(); for (String[] s : ipv4()) a.put(s[0]); return a; }

    @PluginMethod public void getIps(PluginCall call) { JSObject r = new JSObject(); r.put("ips", ipArray()); call.resolve(r); }

    @PluginMethod public void start(PluginCall call) {
        int port = call.getInt("port", 8787);
        final String name = call.getString("name", "host");
        try {
            stopAll();
            server = new Server(port);
            server.start(0, true);
        } catch (IOException e) { call.reject("启动失败: " + e.getMessage()); return; }
        beaconOn = true;
        beacon = new Thread(() -> {
            try (DatagramSocket ds = new DatagramSocket()) {
                ds.setBroadcast(true);
                byte[] msg = ("SBM|" + name + "|" + port).getBytes(StandardCharsets.UTF_8);
                while (beaconOn) {
                    Set<String> targets = new HashSet<>(); targets.add("255.255.255.255");
                    for (String[] s : ipv4()) if (s[1] != null) targets.add(s[1]);
                    for (String t : targets) { try { ds.send(new DatagramPacket(msg, msg.length, InetAddress.getByName(t), BEACON_PORT)); } catch (Exception ignored) {} }
                    Thread.sleep(1500);
                }
            } catch (Exception ignored) {}
        });
        beacon.start();
        JSObject r = new JSObject(); r.put("ips", ipArray()); r.put("port", port); call.resolve(r);
    }

    private void stopAll() {
        beaconOn = false;
        if (server != null) { server.stop(); server = null; }
        socks.clear();
    }
    @PluginMethod public void stop(PluginCall call) { stopAll(); call.resolve(); }

    @PluginMethod public void send(PluginCall call) {
        Sock s = socks.get(call.getInt("id", -1));
        if (s != null) try { s.send(call.getString("data", "")); } catch (IOException e) { socks.remove(s.id); }
        call.resolve();
    }
    @PluginMethod public void broadcast(PluginCall call) {
        String d = call.getString("data", "");
        for (Sock s : socks.values()) try { s.send(d); } catch (IOException e) { socks.remove(s.id); }
        call.resolve();
    }
    @PluginMethod public void kick(PluginCall call) {
        Sock s = socks.remove(call.getInt("id", -1));
        if (s != null) try { s.close(NanoWSD.WebSocketFrame.CloseCode.NormalClosure, "kick", false); } catch (IOException ignored) {}
        call.resolve();
    }

    @PluginMethod public void discover(PluginCall call) {
        final int timeout = call.getInt("timeout", 3000);
        new Thread(() -> {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiManager.MulticastLock lock = wm != null ? wm.createMulticastLock("sbm") : null;
            if (lock != null) lock.acquire();
            Map<String, JSObject> found = new LinkedHashMap<>();
            try (DatagramSocket ds = new DatagramSocket(null)) {
                ds.setReuseAddress(true); ds.setBroadcast(true); ds.bind(new InetSocketAddress(BEACON_PORT));
                long end = System.currentTimeMillis() + timeout; byte[] buf = new byte[512];
                while (System.currentTimeMillis() < end) {
                    ds.setSoTimeout((int) Math.max(1, end - System.currentTimeMillis()));
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    try { ds.receive(p); } catch (SocketTimeoutException e) { break; }
                    String[] parts = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8).split("\\|");
                    if (parts.length == 3 && parts[0].equals("SBM")) {
                        String ip = p.getAddress().getHostAddress();
                        JSObject o = new JSObject(); o.put("ip", ip); o.put("name", parts[1]); o.put("port", Integer.parseInt(parts[2]));
                        found.put(ip, o);
                    }
                }
            } catch (Exception e) { /* 端口被占用等 */ }
            if (lock != null) lock.release();
            JSArray a = new JSArray(); for (JSObject o : found.values()) a.put(o);
            JSObject r = new JSObject(); r.put("hosts", a); call.resolve(r);
        }).start();
    }
}
