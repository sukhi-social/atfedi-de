# 博物街 — museum.atfedi.de

見て回れる、ちいさな展示の街。街区(セクション)ごとに、ひとつの世界を歩けます。

- `/` — 玄関。街区の一覧
- `/section/fedify/` — フェディの街区。fedify・hollo・hackers.pub の地図と
  26の展示室、動くおもちゃ、夜のレンズ(数学の隠れ街)

## 作り

SvelteKit 2 + adapter-static(全ページprerender)。ビルドはモノレポ共通の
`../dist/museum` に出て、dispatcher Worker(`../worker`)が
`museum.atfedi.de` で配ります。

- 部屋の原稿 = `content/rooms/*.md`(frontmatter + Markdoc)。
  独自タグ `{% sutra %}`(経文——中のコードフェンスはビルド時にShikiで焼く)
  と `{% toy id="..." /%}`(動くおもちゃ)
- おもちゃ = `src/lib/toys/*.svelte`(registryは `Toy.svelte`)
- 地図 = `src/lib/map/Map.svelte` + `data.js`(札の口上)
- めぐりの記録(御朱印) = localStorage、地図と展示室で共有

## 街区を増やすとき

`src/routes/section/<名前>/` に新しい街区を建てて、
玄関(`src/routes/+page.svelte`)の `SECTIONS` に一枚足す。

## 開発

    pnpm --filter museum run dev     # 手元で
    pnpm --filter museum run build   # ../dist/museum へ
