/**
 * 場面カード（手書き＋下書き）を、作り手が読んで確かめやすい Markdown にする。
 *
 *   vpx scripts/scene-sheet.ts > docs/scenes.md
 *
 * 下書き（status: draft）は、Claude が書き検査役を通したもの。作り手が確かめて直したら、
 * data/scenes.generated.json の status を "reviewed" にする（直すときは JSON を直す）。
 */
import { findCando } from "../shared/cando.ts";
import { SCENES } from "../shared/scenes.ts";

const out: string[] = [
  "# 場面カード",
  "",
  "`shared/scenes.ts`（手書き）と `data/scenes.generated.json`（Claude の下書き。`scripts/build-scenes.ts`）から作った一覧（`vpx scripts/scene-sheet.ts > docs/scenes.md`）。人物・店・地名・電話番号はすべて架空。",
  "",
  "下書きは、Claude が生活Can do と生活・文化・社会的情報を元に書き、別の検査役が決まった項目（実在の名前・数字が無いか、医療の助言が無いか、Can do に合っているか、notes が一般的か、日本語が自然か）で確かめたもの。**作り手（日本語教師）が確かめるまで `draft`** で、画面では「下書き」と出る。確かめて直したら `status` を `reviewed` にする。",
  "",
  `| | 件数 |\n| --- | --- |\n| 先生が確かめた | ${SCENES.filter((s) => s.status === "reviewed").length} |\n| 下書き | ${SCENES.filter((s) => s.status === "draft").length} |`,
  "",
];
for (const s of SCENES) {
  const c = findCando(s.candoNo);
  out.push(
    `## ${s.title}（通番${s.candoNo}・${c?.level ?? "?"}・${s.channel === "counter" ? "窓口" : "電話"}）${s.status === "draft" ? " — 下書き" : ""}`,
    "",
    `- Can do: ${c?.cando ?? ""}`,
    `- 相手: ${s.partnerRole}${s.office ? "（役所・公共）" : ""}${s.medical ? "（医療の受付。助言はしない）" : ""}`,
    `- 最初の一言: 「${s.opening}」`,
    `- 聞かれること:`,
    ...s.asks.map((a) => `  - ${a.label}: 「${a.example}」`),
    `- 練習用の情報（架空）: ${s.practiceInfo.map((p) => `${p.label}=${p.value}`).join("、")}`,
    `- 本番で起きやすいこと: ${s.twists.join(" / ")}`,
    `- 終わり: ${s.goal}`,
    `- してはいけないこと: ${s.limits.join(" / ")}`,
    `- 知っておくこと（カンペ）: ${s.notes.join(" / ")}`,
    `- 生活・文化・社会的情報: ${s.socialNos.length ? s.socialNos.map((n) => `No.${n}`).join("、") : "なし"}`,
    "",
  );
}
console.log(out.join("\n"));
