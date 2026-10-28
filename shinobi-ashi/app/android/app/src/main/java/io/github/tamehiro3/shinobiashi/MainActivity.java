package io.github.tamehiro3.shinobiashi;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /*
     * 戻るボタンは @capacitor/app が受け取り、画面の 'backButton' の受け手（store.js の SA.Cap.wireBack）が
     * SA.Cap.back() を呼ぶ。重ねた画面を閉じる・ホームへ戻すなど、画面の中で片づけたら何もしない。
     * 片づけるものがなければ App.exitApp()（アプリを閉じる）。ここでは戻るボタンを横取りしない
     * （@capacitor/app の受け手と二重にならないように）。
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 自作プラグインは super.onCreate より前に登録する（Capacitor の決まり）
        registerPlugin(ShinobiStepsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
