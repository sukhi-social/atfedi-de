# yum — おいしい、を分けあう地図（yum.atfedi.de）

fediverse の誰かが「おいしかった」を置いていく、共有の食マップ。
Naver 地図の上に、三色のピン（すき・ふつう・いまいち）と、街の空気の円が乗る。
作りは transit.f3liz.casa の、やさしい方の地図フロントから拝借している。

atfedi.de モノレポの一つの「世界」として、ディスパッチャ Worker が
`yum.atfedi.de` をここのアセットへ振る（danro と同じく、単ページ・i18n サブパスなし）。

## ファイル

```
yum/
  site/            ← ここがそのまま dist/yum/ になる（= 配られるもの）
    index.html       Naver 地図＋タイトル札＋凡例
    app.js           地図の組み立て（places.json を読んでピンを立てる）
    style.css        やわらかい素朴な見た目
    places.json      種のデータ（ピンが一つも無いうちだけ出る）
  package.json     build = site/ を ../dist/yum/ へコピー

worker/yum/         ← 中身のほう（fediverse から届くピン）
  federation.js      @yum@atfedi.de — DM を読んでピンを置く
  naver.js           場所リンク → 座標
  places.js          /places.json を D1 から
  schema.sql         yum_actor / yum_inbox / yum_pins
```

## 種の `places.json`（最初の一つが届くまでの、待っている地図）

ピンは fediverse から届く（下）。`site/places.json` はまだ一つも届いていない
あいだだけ出る種で、いまは**作りものの店を一つも置いていない** — 「誰が分けて
くれたか」がこの地図の芯なので、居ない人の名前を書かないため。ピンがどんな
見た目かは凡例の三つの点が見せてくれるので、見本のピンも要らない。かわりに、
まだ何も無いことと、どうすれば置けるかを言う円がひとつだけ。

手で足したいときは、`places` にこう書く（形はいまも生きている）。

```json
{
  "name": "お店の名前",
  "lat": 37.56, "lng": 126.92,
  "rating": "suki",              // suki / futsuu / imaichi
  "note": "ひとこと（任意）",
  "by": "@who@instance",         // だれが分けてくれたか（任意）
  "src": "https://.../投稿URL"    // 元の投稿（任意）
}
```

`by` と `src` があると、ふきだしに「◯◯が分けてくれた」と出て、元の投稿へ飛べる。

## Naver の地図キー

`index.html` は yum 専用の公開キー（`ncpKeyId=kjrdpxwvrz`）を使う。transit とは
別の鍵（transit は `xlyo3r9uwz`）。

キーは **referer 制限**なので、Naver コンソールでこの鍵の Web サービス URL に
`https://yum.atfedi.de` が入っている必要がある。鍵そのものは公開されていて大丈夫。
登録されていないと、地図のかわりにやさしい案内が出る（`app.js` の `no-key` 分岐）。

**curl では確かめられない** — `maps.js` は referer に関係なく同じものを返し、
referer 判定は地図の初期化時に効く。ブラウザで開くのが唯一の確認方法。

## fediverse から、ピンが届く — 公開投稿 ＋ DM

`@yum@atfedi.de` が apex に住んでいて（kiosk のとなり）、二段の身ぶりでピンが立つ。

1. **お店のことを、公開で投稿する** — いつもどおりに。フォロワーには自然に流れる。
2. **その自分の投稿に、リプライで `@yum@atfedi.de` に DM を出す** — 中身は
   Naver の場所リンク（＋ `すき` / `ふつう` / `いまいち` を書けば色が決まる）。

yum は DM に確認を返し、ピンが立つ。**DM を消すと、ピンも消える。**
同じ投稿にもう一度 DM を出すと、上書き（＝色の直しかた）。

```
公開投稿: 「ここのとんかつ、衣が軽くてすき」   ← この文が、ふきだしに出る
   └ DM →  https://naver.me/xAb3kQ  すき      ← 座標と色だけ運ぶ、機械の口
```

### 「拾う合図」が DM であることの意味

DM を出すこと自体が、はっきりした「置いていいよ」。だから漁るタグも、
見張るタイムラインも要らない。誰の投稿を拾うかも、同時に決まる。

### 保存することと、公開すること（別の約束）

混ざりやすいので、分けて書く。

- **入ってきたものは、保存する**（`yum_inbox`）。読む前に、生の activity のまま
  書き留める。だから Naver の読み取りが失敗した DM も、色を読み違えた DM も、
  あとで naver.js が良くなってから**やり直せる**。`outcome` に「なぜ断ったか」が
  入っていて、それがそのまま再挑戦の待ち行列になる。
- **公開されるのは、公開投稿の文だけ**（`yum_pins.note`）。DM の文は、地図には
  一度も出ない。保存はする、公開はしない。

例外がひとつ。送り主が DM を消したら（`Delete`）、それは「忘れて」なので
`raw` を消す。「何かが来て、取り下げられた」という事実だけ残す。

### 断るとき（どれも、公開の場ではなく DM で返す）

| なぜ | `outcome` |
|---|---|
| 投稿にぶら下がっていない | `no-parent` |
| その投稿が読めない（相手サーバが不調など・**あとで再挑戦する価値あり**） | `parent-unreadable` |
| 自分の投稿じゃない（他人の投稿は代わりに置けない） | `not-own-post` |
| その投稿が公開じゃない（地図は誰でも見られるので） | `parent-not-public` |
| 場所が読めなかった（**Naver のページは契約ではない。ここが一番やり直す所**） | `place-unresolved` |

## 建てるのに要るもの（nyanrus の手）

```bash
# 1. テーブル(yum_actor / yum_inbox / yum_pins)を D1 に当てる
pnpm exec wrangler d1 execute atfedi-fedi --remote --file worker/yum/schema.sql

# 2. (任意) Naver の地域検索API — リンクから座標が取れなかったときの、名前での当て
pnpm exec wrangler secret put NAVER_SEARCH_ID     --name atfedi
pnpm exec wrangler secret put NAVER_SEARCH_SECRET --name atfedi

# 3. デプロイ
pnpm run deploy:yum
```

2 を入れなくても動く（その段は黙って飛ばされる）。入れると、リンクから座標を
拾えなかったときに、店名で公式APIに当てにいく道が開く。

`@yum@atfedi.de` の鍵は初回アクセス時に自分で作って `yum_actor` に入る。

## D1 は分けない（2026-07-26 決めた）

`atfedi-fedi` 一つに、blog の連合・kiosk・console・yum が同居している。
yum を足すとき「サービスごとに分けるか」を検討して、**分けない**ことにした。

- **跨いだ JOIN はゼロ**。JOIN は二つとも自分のサービスの中で閉じている
  （`comments`×`remote_actors`、`kiosk_papers`×`kiosk_tags`）。console は
  連合の session を見て `kiosk_tags` を書くが、別々のクエリ。つまり分ける
  余地はいつでもある — 急いで分ける理由がない、ということでもある。
- **分けたくなった動機は、分割では解けない**。軋んだのは `kv` の共有だが、
  fedify の prefix 六つのうち分離が要るのは `activityIdempotence` 一つだけ
  （kiosk と yum が同じ origin だから。詳しくは `worker/yum/federation.js`）。
  残り五つは共有したほうが得なキャッシュと安全側の状態で、**DBを分けると
  それを失う**。
- 数字も当分効かない（10GB/DB、バインディング〜5000、1000クエリ/invocation）。

**分けるときが来るとしたら**: kiosk の sweep が育って 10GB か restore の重さが
気になったとき。Time Travel は DB 単位なので、kiosk の巻き添えで blog の連合まで
巻き戻るのが一番痛い。出すなら kiosk が最初（六テーブルで自己完結、外から触るのは
console のタグ付けだけ）。

なお `yum_inbox` は「入ってきたものは保存する」ので、原理的には青天井に育つ。
人が DM を送る速さでしか増えないので当分小さいが、重くなったら
`outcome='placed'` で決着した古い行の `raw` だけ落とす（事実は残す）畳み方がある。

## 地図の見た目 — `/places.json`

`app.js` は `/places.json` を fetch して描くだけ。worker がピンを持っていれば
D1 から、まだ一つも無ければ `site/places.json` の種がそのまま出る。だから
最初のピンが届くまで、地図が真っ白になることはない。

## デプロイ

モノレポの流儀どおり（`atfedi-de` ルートで）:

```bash
pnpm run build            # 全世界ビルド（yum は site/ を dist/yum/ へコピー）
pnpm run deploy:worker    # ひとつの Worker を再デプロイ

# yum だけ入れ替えるとき:
pnpm run deploy:yum
```

`yum.atfedi.de` は `worker/wrangler.jsonc` の routes に `custom_domain` で
入れてある。wrangler が DNS ごと自動で作る。
