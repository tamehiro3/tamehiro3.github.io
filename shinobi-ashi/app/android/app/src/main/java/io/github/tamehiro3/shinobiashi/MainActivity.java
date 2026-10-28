package io.github.tamehiro3.shinobiashi;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * 戻るボタン: まず画面（store.js の SA.Cap.back()）に聞く。重ねた画面を閉じる・ホームへ戻すなど、
     * 画面の中で片づけたら true が返る。false（または答えがない）ならアプリを閉じる（ふつうの戻る）。
     * @capacitor/app を足さずに済ませるための小さな仕組み（依存を増やさない）。
     */
    private static final String BACK_JS =
        "(function(){try{return !!(window.SA&&SA.Cap&&typeof SA.Cap.back==='function'&&SA.Cap.back());}catch(e){return false;}})()";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 自作プラグインは super.onCreate より前に登録する（Capacitor の決まり）
        registerPlugin(ShinobiStepsPlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = bridge != null ? bridge.getWebView() : null;
                if (web == null) { exitByDefault(this); return; }
                web.evaluateJavascript(BACK_JS, value -> {
                    if (!"true".equals(value)) exitByDefault(this);
                });
            }
        });
    }

    /** この仕組みを一度だけ外して、ふつうの戻る（アプリを閉じる）を行い、また付け直す */
    private void exitByDefault(OnBackPressedCallback cb) {
        cb.setEnabled(false);
        try {
            getOnBackPressedDispatcher().onBackPressed();
        } finally {
            cb.setEnabled(true);
        }
    }
}
