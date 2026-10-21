# 記事を出すまで — ブランチ → push → プレビュー → マージ → デプロイ

blog.atfedi.de に記事を出すときの、いつもの道すじ。書く内容の指針は
[`writing.md`](./writing.md)（三言語の重心）と
[`translation-ko.md`](./translation-ko.md)（韓国語）に。ここは運びかたの話だけ。

## 全体図

```
下書き(.mdoc) → ローカルbuild → ブランチにcommit & push
    → /v/preview/{branch}/-/{lang}/{slug} で推敲
    → main にマージ → clean worktree から deploy → 本番確認
```

プレビューは **GitHub のブランチを直接読む**ので、push するだけで映る。
デプロイは記事が main に入ってから、最後に一度だけ。

## 1. 下書き

置き場所は言語ごとに一枚ずつ:

```
blog/src/content/posts/{ja,en,ko}/{slug}.mdoc
```

frontmatter は `title` / `description` / `date` / `author`。原稿でよく踏む穴:

- **一段落は一行で書く**。段落内のハード改行は、CJK では文字間の隙間になる。
- **CJK の太字は、閉じ `**` の直前を約物にしない**。直前が「。」や「)」で
  直後が CJK 文字だと、閉じが効かず崩れる。約物を外に出す:
  `**〜こと。**連合` → `**〜こと**。連合`、
  `**정문선(초록)**은` → `**정문선**(초록)은`。
- en / ko は翻訳ではなく transcreation。長さも構造も違ってよい
  （→ `writing.md`）。

## 2. 手元で確かめる

```sh
pnpm --filter blog run build
```

これで Markdoc が通るか（frontmatter の欠け・構文の崩れ）まで分かる。
見た目も見たければ `pnpm --filter blog run dev`。
**CSS や レイアウトを触った場合はここが本番前の唯一の確認場所**
（後述のとおり、プレビューにはスタイル変更が映らない）。

## 3. ブランチにして push

```sh
git switch -c blog/{slug}
git add blog/src/content/posts/*/{slug}.mdoc
git commit && git push -u origin blog/{slug}
```

- ブランチ名は `blog/{slug}` が慣例。スラッシュは URL を壊さない。
- **`pr-` で始まる名前だけは付けない**（プレビューが PR 番号と読み違える。
  理由の詳細は [CONTRIBUTING](../CONTRIBUTING.md#naming-your-branch)）。

## 4. プレビューで推敲

```
https://blog.atfedi.de/v/preview/{branch}/-/{lang}/{slug}
```

仕組みと、知っておくとよいこと:

- ページは Worker が **GitHub の raw content をその場で読んで** SSR する。
  ビルドも再デプロイも要らず、push が反映のすべて。
- ref の解決は 30 秒キャッシュされる。push 直後は最大 30 秒、前の版が
  出ることがある。あわてず一呼吸。
- **CSS / JS はデプロイ済みのものを使う**。スタイルやレイアウトの変更は
  プレビューに映らない（§2 のローカル確認で）。本文の推敲には十分。
- どのプレビューページも `noindex`。検索には載らない。
- PR を開いたなら `pr-{number}` も ref に使える。

推敲はここで済ませる。直しては push、を好きなだけ。ko はできれば
公開前に一度、ネイティブの目を通す（→ `translation-ko.md` 冒頭の注記）。

## 5. main にマージ

読み終わって、直すところが無くなったら:

```sh
git switch main
git merge blog/{slug}
git push
```

マージしただけでは、まだ本番には出ない。

## 6. clean worktree からデプロイ

```sh
git worktree add --detach /tmp/atfedi-deploy main
cd /tmp/atfedi-deploy
pnpm install --frozen-lockfile
pnpm run deploy        # 全 workspace build → wrangler deploy
cd - && git worktree remove /tmp/atfedi-deploy
```

作業ツリーから直接 deploy しないのは、**そこに居る別の未公開下書きや
untracked ファイルを巻き込まない**ため。worktree は main のコミットだけを
持つので、出るものはいつも「main に入っているもの」と一致する。
`pnpm run deploy` は wrangler の認証（`wrangler login` 済みか
`CLOUDFLARE_API_TOKEN`）が要る。

## 7. 本番確認

```sh
for l in ja en ko; do
  curl -s -o /dev/null -w "%{http_code} $l\n" \
    "https://blog.atfedi.de/$l/{slug}"
done
```

三言語とも 200 が返って、目でも一度読めたら、おしまい。

## 付録: プレビューの仕組み（ソース地図）

`/v/preview/*` の中を触るとき用の、実装の見取り図。運用は §4 で足りる。
ここは「どこが動かしているか」だけ。

- **ルーティング** — `worker/index.js` が `/v/preview/` で始まるリクエスト
  だけを preview の SSR worker へ委譲する（`worker/index.js:198`、
  `previewSSR.fetch`）。ほかの blog は素の静的アセット。
- **SSR 本体** — `preview/` は一枚ルートだけの Astro SSR プロジェクト
  （`output: 'server'` ＋ Cloudflare adapter、`preview/astro.config.mjs`）。
  ルートは `preview/src/pages/v/preview/[...path].astro`、描画ロジックは
  `preview/src/lib/preview.ts`。
- **中身は GitHub から直読み** — `resolveRef` が ref を解決し（ブランチは
  GitHub API `/commits/{ref}`、`pr-{n}` は `/pulls/{n}` の head＝**fork の
  PR でも読める**）、`fetchRaw` が
  `raw.githubusercontent.com/{owner}/{repo}/{sha}/…` から `.mdoc` を取る。
  だから push だけで映る＝**ビルドも再デプロイも要らない**。
- **レンダリング** — Markdoc の core renderer。`html: false` のまま＝
  **本文の生 HTML はテキストにエスケープされる**（信用しない PR の中身への
  安全策）。コードフェンスは shiki で後段ハイライト（blog.css の
  `--astro-code-*` を共有）、見出し id は github-slugger で blog と同じ。
- **AI バッジ** — 著者が `ai: true` かを、同じ ref の
  `blog/src/content/authors/{lang|en}/{id}.mdoc` から読む（`authorIsAi`）。
  その ref に著者ファイルが無ければ、badge 無しで本文だけ出る（壊れない）。
- **CSS の出どころ** — preview の client アセットはビルド時に blog の
  `/_astro/` へマージされる（ルート `package.json` の `postbuild`）。
  ゆえに **preview は「デプロイ済みの」CSS/JS を着る**＝§4 の「スタイル変更は
  映らない」の実装的な理由。
- **キャッシュ** — ref 解決は 30 秒、SHA 固定の raw は 24 時間。新しい
  push は SHA が変わるので即反映、同一 ref の再解決だけが最大 30 秒遅れる。
- **ビルド連結** — `preview` は monorepo build に含まれ、
  `dist/preview/server/entry.mjs` を worker が import（`worker/index.js:19`）。
  `dist/.assetsignore` に `preview` を書いて、preview の HTML 自体は静的配信
  から外す（CSS だけ blog に混ぜる）。
