import { describe, expect, it } from "vite-plus/test";
import { fillPersona, PERSONAS } from "./persona.ts";
import { SCENES } from "./scenes.ts";

describe("fillPersona", () => {
  it("〔名前〕などを、言語ごとの架空の人物に置き換える", () => {
    expect(fillPersona("〔名前〕です。", "vi")).toBe(`${PERSONAS.vi!.name}です。`);
    expect(fillPersona("夫 〔配偶者の名前〕、娘 〔子どもの名前〕", "ko")).toBe(
      `夫 ${PERSONAS.ko!.spouse}、娘 ${PERSONAS.ko!.child}`,
    );
  });
  it("知らない言語・無指定は日本語の人物", () => {
    expect(fillPersona("〔名前〕", "xx")).toBe(PERSONAS.ja!.name);
    expect(fillPersona("〔名前〕", null)).toBe(PERSONAS.ja!.name);
  });
  it("場面カードの練習用の情報に、本人・子ども・配偶者の名前を直接書いていない", () => {
    // 架空でも特定の国の名前に固定しない。名前はトークンで書き、言語ごとに差し替える
    const names = Object.values(PERSONAS).flatMap((p) => [p.name, p.child, p.spouse]);
    for (const s of SCENES) {
      for (const i of s.practiceInfo) {
        for (const n of names) expect(i.value, `${s.id} ${i.label}`).not.toContain(n);
        if (/^(自分の)?名前|^保護者の名前|^自分$/.test(i.label))
          expect(i.value, `${s.id} ${i.label}`).toContain("〔名前〕");
      }
    }
  });
});
