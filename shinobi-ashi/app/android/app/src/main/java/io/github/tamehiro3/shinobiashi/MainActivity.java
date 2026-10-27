package io.github.tamehiro3.shinobiashi;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 自作プラグインは super.onCreate より前に登録する（Capacitor の決まり）
        registerPlugin(ShinobiStepsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
