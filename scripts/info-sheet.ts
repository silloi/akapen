/**
 * 作り手が確かめるための一覧を作る。
 *
 *   vpx scripts/info-sheet.ts
 *
 * - docs/glossary.md: 用語集の下書き（Claude が説明した語。場面ごと）と、公的な用語集の件数
 * - docs/public-info.md: 場面ごとに出す公的な情報のページ
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { GlossCore } from "../shared/glossary.ts";
import type { PublicInfoData } from "../shared/public-info.ts";
import { SCENES } from "../shared/scenes.ts";

const core = JSON.parse(readFileSync("data/glossary/core.json", "utf8")) as GlossCore;
const drafts = JSON.parse(readFileSync("data/glossary/drafts.json", "utf8")) as Record<
  string,
  {
    skip: boolean;
    reading?: string;
    easy?: string;
    phrase?: boolean;
    scenes: string[];
    status: string;
  }
>;
const info = JSON.parse(readFileSync("data/public-info.json", "utf8")) as PublicInfoData;

// ---- 用語集 ----
const g: string[] = [
  "# 用語集（ことばの意味）",
  "",
  "練習の画面で相手の言葉の語に下線を引き、タップで意味を出す。赤ペンの「この会話に出てきたことば」、カンペの「ことば」にも使う。`vpx scripts/info-sheet.ts` で作る。",
  "",
  "## 公的な用語集（そのまま使う）",
  "",
  "| 用語集 | 語の数 | 出典 |",
  "| --- | --- | --- |",
];
for (const s of core.sources.filter((x) => x.id !== "draft")) {
  const n = core.entries.filter((e) => e.source === s.id).length;
  g.push(`| ${s.name} | ${n} | ${s.attribution} |`);
}
const kept = Object.entries(drafts).filter(([, d]) => !d.skip && d.easy);
g.push(
  "",
  "## Claude の下書き（作り手が確かめる）",
  "",
  `場面の keyterms と、電話・窓口の言い回しのうち、公的な用語集に無い ${kept.length} 語。架空の店・人・地名と、だれでも知っている語は外した（${Object.values(drafts).filter((d) => d.skip).length} 語）。画面では「下書き」と出す。確かめたら \`data/glossary/drafts.json\` の \`status\` を \`reviewed\` にする（直すときは \`easy\` を書き換え、\`vpx scripts/build-glossary.ts <yasashii-refs> --i18n\` で訳を作り直す）。`,
  "",
  "### 電話・窓口の言い回し",
  "",
);
for (const [term, d] of kept.filter(([, d]) => d.phrase))
  g.push(`- **${term}**（${d.reading}）: ${d.easy}`);
for (const s of SCENES) {
  const list = kept.filter(([, d]) => !d.phrase && d.scenes.includes(s.id));
  if (!list.length) continue;
  g.push("", `### ${s.title}（${s.id}）`, "");
  for (const [term, d] of list) g.push(`- **${term}**（${d.reading}）: ${d.easy}`);
}
writeFileSync("docs/glossary.md", `${g.join("\n")}\n`);

// ---- 公的な情報 ----
const p: string[] = [
  "# 場面に関係する公的な情報",
  "",
  "カンペの画面の下に出すリンク。リンク先は yasashii-refs の目録にある公的なページだけ（Claude に URL を作らせない）。場面との対応は `scripts/build-public-info.ts` の `RULES`（場面の文に出てくる語）で Claude Code が決めた。作り手が確かめる。`vpx scripts/info-sheet.ts` で作る。",
  "",
  "## ページ",
  "",
  "| ページ | 発行 | 言語 | 確かめた日 |",
  "| --- | --- | --- | --- |",
];
for (const r of info.resources)
  p.push(
    `| [${r.label ?? r.name}](${r.url}) | ${r.publisher} | ${r.languages.length} | ${r.checked} |`,
  );
p.push("", "## 場面ごと", "", "| 場面 | ガイドブックの章 | ページ |", "| --- | --- | --- |");
for (const s of SCENES) {
  const v = info.scenes[s.id];
  if (!v) continue;
  const names = v.ids
    .filter((id) => id !== "life-work-guidebook" && id !== "isa-ichigen-soudan")
    .map((id) => {
      const r = info.resources.find((x) => x.id === id);
      return r ? (r.label ?? r.name).replace(/（.*$/, "") : id;
    });
  p.push(
    `| ${s.title} | ${v.chapters.map((n) => `${n} ${info.chapters[n]}`).join("、") || "—"} | ${names.join("、") || "—"} |`,
  );
}
p.push("", "どの場面にも、生活・就労ガイドブックと、外国人のための相談窓口の一覧を出す。");
writeFileSync("docs/public-info.md", `${p.join("\n")}\n`);
console.log("docs/glossary.md, docs/public-info.md");
