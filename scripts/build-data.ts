/**
 * yasashii-refs の data/seikatsu-cando.jsonl から、akapen で使う分だけを data/cando.json に書き出す。
 *
 *   vpx scripts/build-data.ts <yasashii-refs の場所>
 *
 * - 生活Can do のうち、言語活動が「やり取り」のもの（予行演習は相手と話す場面だけ）
 * - 生活・文化・社会的情報（カンペの「前もって知っておくこと」に使う）
 * 出典は data/cando.meta.json（元の meta.json の attribution をそのまま写す）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CanDo, CandoData, SocialInfo } from "../shared/types.ts";

const root = process.argv[2];
if (!root) {
  console.error("使い方: vpx scripts/build-data.ts <yasashii-refs の場所>");
  process.exit(1);
}

const rows = readFileSync(join(root, "data/seikatsu-cando.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Record<string, unknown>);
const meta = JSON.parse(
  readFileSync(join(root, "data/seikatsu-cando.meta.json"), "utf8"),
) as Record<string, unknown>;

const candos: CanDo[] = rows
  .filter((r) => r.kind === "生活Can do" && r.activity === "やり取り")
  .map((r) => ({
    no: r.no as number,
    level: r.level as CanDo["level"],
    category: r.category as string,
    cando: r.cando as string,
    majorNo: r.major_no as string,
    major: r.major as string,
    minorNo: r.minor_no as string,
    minor: r.minor as string,
    essential: Boolean(r.essential),
    case1: r.case1 as string,
    case2: r.case2 as string,
  }));

const social: SocialInfo[] = rows
  .filter((r) => r.kind === "生活・文化・社会的情報")
  .map((r) => ({
    no: r.no as number,
    minorNo: r.minor_no as string,
    text: r.text as string,
    mustKnow: Boolean(r.must_know),
  }));

const data: CandoData = { version: meta.version as string, candos, social };
writeFileSync("data/cando.json", JSON.stringify(data) + "\n");
writeFileSync(
  "data/cando.meta.json",
  JSON.stringify(
    {
      from: "https://github.com/silloi/yasashii-refs/blob/main/data/seikatsu-cando.jsonl",
      name: meta.name,
      version: meta.version,
      url: meta.url,
      license: meta.license,
      license_url: meta.license_url,
      attribution: meta.attribution,
      note: "言語活動が「やり取り」の Can do と、生活・文化・社会的情報だけを取り出し、項目名を変えた（scripts/build-data.ts）",
      candos: candos.length,
      social: social.length,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Can do ${candos.length} 件、生活・文化・社会的情報 ${social.length} 件`);
