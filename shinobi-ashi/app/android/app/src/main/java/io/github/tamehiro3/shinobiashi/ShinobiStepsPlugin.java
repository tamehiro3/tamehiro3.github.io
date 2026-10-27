package io.github.tamehiro3.shinobiashi;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailabilityLight;
import com.google.android.gms.fitness.FitnessLocal;
import com.google.android.gms.fitness.LocalRecordingClient;
import com.google.android.gms.fitness.data.LocalBucket;
import com.google.android.gms.fitness.data.LocalDataPoint;
import com.google.android.gms.fitness.data.LocalDataSet;
import com.google.android.gms.fitness.data.LocalDataType;
import com.google.android.gms.fitness.data.LocalField;
import com.google.android.gms.fitness.request.LocalDataReadRequest;
import com.google.android.gms.fitness.result.LocalDataReadResponse;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 忍び足 — Android の歩数（自作プラグイン ShinobiSteps）。
 *
 * (b) Recording API on mobile（Google Play 開発者サービスの LocalRecordingClient）
 *     subscribe() で TYPE_STEP_COUNT_DELTA の記録を始め、readHourly({start,end}) で1時間ごとの歩数を読む。
 *     記録は購読した時点から端末の中だけに最大10日。ネットワークもアカウントも使わない。
 * (c) 歩数センサー（TYPE_STEP_COUNTER）の現在値。readCounter() が「起動してからの歩数」と BOOT_COUNT を返し、
 *     前回値との差を JS（steps.js）が「今日」に足す。installId はバックアップに入らない場所に置いた印で、
 *     バックアップから戻したとき（印が変わる）に基準を捨てるために使う。
 * 歩行中判定: walkingNow({ms}) が TYPE_STEP_DETECTOR のイベント数を数える。
 *
 * インターネットは使わない（AndroidManifest で INTERNET 権限を外している）。
 */
@CapacitorPlugin(
    name = "ShinobiSteps",
    permissions = { @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = ShinobiStepsPlugin.ACTIVITY) }
)
public class ShinobiStepsPlugin extends Plugin {

    static final String ACTIVITY = "activity";
    private static final String INSTALL_FILE = "shinobi-install-id";
    private static final long COUNTER_TIMEOUT_MS = 2500;
    private static final long MAX_RANGE_MS = 11L * 24 * 60 * 60 * 1000; // 10日＋余裕

    private final Handler main = new Handler(Looper.getMainLooper());

    /* ---------------- 使えるかどうか ---------------- */

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("recording", recordingAvailable());
        r.put("counter", sensor(Sensor.TYPE_STEP_COUNTER) != null);
        r.put("detector", sensor(Sensor.TYPE_STEP_DETECTOR) != null);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    private boolean recordingAvailable() {
        try {
            int code = GoogleApiAvailabilityLight.getInstance()
                .isGooglePlayServicesAvailable(getContext(), LocalRecordingClient.LOCAL_RECORDING_CLIENT_MIN_VERSION_CODE);
            return code == ConnectionResult.SUCCESS;
        } catch (Throwable t) {
            return false; // Google Play 開発者サービスがない端末など
        }
    }

    private Sensor sensor(int type) {
        SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        return sm == null ? null : sm.getDefaultSensor(type);
    }

    /* ---------------- 許可（ACTIVITY_RECOGNITION） ---------------- */

    @PluginMethod
    public void checkPermission(PluginCall call) {
        call.resolve(permResult());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState(ACTIVITY) == PermissionState.GRANTED) {
            call.resolve(permResult());
            return;
        }
        requestPermissionForAlias(ACTIVITY, call, "onActivityPermission");
    }

    @PermissionCallback
    private void onActivityPermission(PluginCall call) {
        call.resolve(permResult());
    }

    private JSObject permResult() {
        JSObject r = new JSObject();
        PermissionState s = getPermissionState(ACTIVITY);
        String v = "prompt";
        if (s == PermissionState.GRANTED) v = "granted";
        else if (s == PermissionState.DENIED) v = "denied";
        r.put("activity", v);
        return r;
    }

    private boolean granted() {
        return getPermissionState(ACTIVITY) == PermissionState.GRANTED;
    }

    /** JS の数（Integer / Long / Double のどれで来ても）を long で取る。PluginCall.getLong は Integer を受け付けないため。 */
    private static Long num(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        return v instanceof Number ? Long.valueOf(((Number) v).longValue()) : null;
    }

    /* ---------------- (b) Recording API ---------------- */

    @PluginMethod
    public void subscribe(PluginCall call) {
        if (!granted()) { call.reject("permission", "NO_PERMISSION"); return; }
        if (!recordingAvailable()) { call.reject("recording api unavailable", "UNAVAILABLE"); return; }
        try {
            LocalRecordingClient client = FitnessLocal.getLocalRecordingClient(getContext());
            client.subscribe(LocalDataType.TYPE_STEP_COUNT_DELTA)
                .addOnSuccessListener(v -> {
                    JSObject r = new JSObject();
                    r.put("ok", true);
                    call.resolve(r);
                })
                .addOnFailureListener(e -> call.reject("subscribe failed: " + e.getMessage(), "SUBSCRIBE_FAILED", e));
        } catch (Throwable t) {
            call.reject("subscribe failed: " + t.getMessage(), "SUBSCRIBE_FAILED");
        }
    }

    /** start / end はミリ秒（エポック）。1時間ごとの { start, end, steps } を返す。 */
    @PluginMethod
    public void readHourly(PluginCall call) {
        if (!granted()) { call.reject("permission", "NO_PERMISSION"); return; }
        Long start = num(call, "start");
        Long end = num(call, "end");
        if (start == null || end == null || end <= start) { call.reject("start and end are required", "BAD_RANGE"); return; }
        long now = System.currentTimeMillis();
        if (end > now) end = now;
        if (end - start > MAX_RANGE_MS) start = end - MAX_RANGE_MS;
        if (end <= start) {
            JSObject r = new JSObject();
            r.put("buckets", new JSArray());
            call.resolve(r);
            return;
        }
        try {
            LocalRecordingClient client = FitnessLocal.getLocalRecordingClient(getContext());
            LocalDataReadRequest req = new LocalDataReadRequest.Builder()
                .aggregate(LocalDataType.TYPE_STEP_COUNT_DELTA)
                .bucketByTime(1, TimeUnit.HOURS)
                .setTimeRange(start / 1000L, end / 1000L, TimeUnit.SECONDS)
                .build();
            client.readData(req)
                .addOnSuccessListener(resp -> call.resolve(toBuckets(resp)))
                .addOnFailureListener(e -> call.reject("read failed: " + e.getMessage(), "READ_FAILED", e));
        } catch (Throwable t) {
            call.reject("read failed: " + t.getMessage(), "READ_FAILED");
        }
    }

    private JSObject toBuckets(LocalDataReadResponse resp) {
        JSArray arr = new JSArray();
        for (LocalBucket b : resp.getBuckets()) {
            long steps = 0;
            for (LocalDataSet ds : b.getDataSets()) {
                for (LocalDataPoint dp : ds.getDataPoints()) {
                    steps += dp.getValue(LocalField.FIELD_STEPS).asInt();
                }
            }
            JSObject o = new JSObject();
            o.put("start", b.getStartTime(TimeUnit.MILLISECONDS));
            o.put("end", b.getEndTime(TimeUnit.MILLISECONDS));
            o.put("steps", steps);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("buckets", arr);
        return r;
    }

    /* ---------------- (c) 歩数センサーの現在値 ---------------- */

    @PluginMethod
    public void readCounter(PluginCall call) {
        if (!granted()) { call.reject("permission", "NO_PERMISSION"); return; }
        final SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        final Sensor s = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (s == null) { call.reject("no step counter", "UNAVAILABLE"); return; }
        final boolean[] done = { false };
        final SensorEventListener[] holder = new SensorEventListener[1];
        holder[0] = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (done[0]) return;
                done[0] = true;
                sm.unregisterListener(this);
                JSObject r = counterInfo();
                r.put("steps", (long) event.values[0]);
                call.resolve(r);
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        boolean ok = sm.registerListener(holder[0], s, SensorManager.SENSOR_DELAY_NORMAL, 0, main);
        if (!ok) { call.reject("register failed", "UNAVAILABLE"); return; }
        main.postDelayed(() -> {
            if (done[0]) return;
            done[0] = true;
            sm.unregisterListener(holder[0]);
            call.reject("no counter event", "TIMEOUT");
        }, COUNTER_TIMEOUT_MS);
    }

    private JSObject counterInfo() {
        JSObject r = new JSObject();
        int boot = -1;
        try {
            boot = Settings.Global.getInt(getContext().getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        } catch (Throwable ignored) {}
        r.put("bootCount", boot);
        r.put("elapsedRealtime", SystemClock.elapsedRealtime());
        r.put("timestamp", System.currentTimeMillis());
        r.put("installId", installId());
        return r;
    }

    /** バックアップに入らない場所（getNoBackupFilesDir）に置いた、この端末への入れ方ごとの印。 */
    private String installId() {
        File f = new File(getContext().getNoBackupFilesDir(), INSTALL_FILE);
        try {
            if (f.exists()) {
                byte[] buf = new byte[64];
                int n;
                try (FileInputStream in = new FileInputStream(f)) { n = in.read(buf); }
                if (n > 0) {
                    String v = new String(buf, 0, n, StandardCharsets.UTF_8).trim();
                    if (!v.isEmpty()) return v;
                }
            }
            String id = UUID.randomUUID().toString();
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(id.getBytes(StandardCharsets.UTF_8)); }
            return id;
        } catch (Exception e) {
            return "";
        }
    }

    /* ---------------- 歩行中判定 ---------------- */

    @PluginMethod
    public void walkingNow(PluginCall call) {
        Long msOpt = num(call, "ms");
        int ms = msOpt == null ? 3000 : (int) Math.min(Integer.MAX_VALUE, Math.max(0L, msOpt));
        if (ms < 500) ms = 500;
        if (ms > 10000) ms = 10000;
        final SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        final Sensor s = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        if (s == null || !granted()) {
            JSObject r = new JSObject();
            r.put("events", 0);
            r.put("available", false);
            call.resolve(r);
            return;
        }
        final int[] count = { 0 };
        final SensorEventListener l = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) { count[0]++; }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        sm.registerListener(l, s, SensorManager.SENSOR_DELAY_FASTEST, 0, main);
        main.postDelayed(() -> {
            sm.unregisterListener(l);
            JSObject r = new JSObject();
            r.put("events", count[0]);
            r.put("available", true);
            call.resolve(r);
        }, ms);
    }
}
