# Furifont（ふりがなのフォント）

練習の画面の会話に、ふりがなを付けるために使っています。

- 出どころ: [Furifont](https://furifont.antfu.me)（Anthony Fu、https://github.com/antfu/furifont ）0.7.0。`https://furifont.antfu.me/fonts/` の配布物をそのまま置いています（変更していません）。
- `FurifontSansVF.woff2`: フォント。SIL Open Font License 1.1（`OFL.txt`）。Adobe の Source Han Sans から作られています。
- `FurifontSansVF.ivs.json`・`okurigana.json`: 送りがなの続く漢字の読みを選ぶための表。Creative Commons Attribution-ShareAlike 4.0。JMdict・JMnedict・KANJIDIC2（EDRDG）、JmdictFurigana などから作られています（`DICTIONARY-LICENSE.md`）。
- 読みを選ぶ処理（`src/lib/furigana.ts`）は、Furifont のユーザースクリプト（MIT）の送りがなの読み取りを移したものです。
