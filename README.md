# ⚛ Quantum Circuit Simulator

量子計算の「回路設計 → 状態遷移の可視化 → 測定結果の確認」を、直感的なUIとアニメーションで学習・理解できるWebアプリケーションです。

---

## 起動方法

ES Modules を使用しているため、ローカルHTTPサーバーが必要です。

```bash
cd /Users/nakadairamasashi/量子回路
python3 -m http.server 8080
```

ブラウザで **http://localhost:8080** を開いてください。

---

## ファイル構成 (9モジュール構成)

```
.
├── index.html          # エントリポイント
├── styles.css          # デザイン・レイアウト
├── model/
│   └── circuit.js      # データモデル (Gate, Circuit, InputState)
├── sim/
│   ├── complex.js      # 複素数演算 + Seeded RNG
│   └── statevector.js  # シミュレーションエンジン
├── ui/
│   ├── controls.js     # アプリ制御 (Main Controller)
│   ├── svgCanvas.js    # 回路描画 + 電流アニメーション
│   ├── dragDrop.js     # ドラッグ＆ドロップ操作
│   ├── stateViewer.js  # 状態表示 (Dirac, Amplitudes, Histogram)
│   └── animation.js    # 再生制御
└── storage/
    └── localStorage.js # 保存・読み込み
```

---

## 📘 Learn Mode (New!)
ヘッダーの **Learn** ボタンから学習ラボを開けます。

- **Hadamard Test**: 干渉と位相の学習
- **SWAP Test**: 量子状態の類似度判定
- **QFT**: 量子フーリエ変換の可視化
- **Phase Estimation**: 位相推定アルゴリズム

**機能**:
- **Load Lab Circuit**: 回路図を自動ロード
- **Set Inputs**: 入力状態をプリセット
- **Run Shots & Check**: 実行結果と期待値を自動照合 (Pass/Fail)

---

## 主な機能

1. **回路設計**
   - ドラッグ＆ドロップでゲート配置
   - クリック配置、ダブルクリック削除
   - 列の自動拡張
   - ワイヤー数変更 (1〜5 qubits)

2. **シミュレーション**
   - 状態ベクトル法 (最大5 qubits)
   - 再現可能な測定 (Seeded RNG)
   - 測定モード: Probability / Single Shot

3. **可視化**
   - **電流フロー**: 白色光がゲート通過時に色付くアニメーション
   - **Dirac記法**: |ψ⟩ = α|0⟩ + β|1⟩ ...
   - **詳細ビュー**: 振幅棒グラフ(位相色)、測定ヒストグラム

4. **保存機能**
   - LocalStorage に回路と入力状態を保存

---

## サポートゲート

- **Single**: I, X, Y, Z, H, S, T
- **Rotation**: Rx, Ry, Rz (θパラメータ指定)
- **Multi**: CNOT, CZ, SWAP
- **Measure**: M

---

## デモ回路

ヘッダーボタンから即座にロード可能:
- **H → Measure**: 重ね合わせの基本
- **Bell State**: 量子もつれ (Entanglement)
- **GHZ State**: 3量子ビットのもつれ


## 使い方メモ
1. フェッチ
   git fetch --all
2. チェックアウト
3. Windowsの人はこっち
   python -m http.server 8081
