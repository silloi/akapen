/**
 * 用語集を読み込む（練習の画面・赤ペン・カンペで使う）。大きいので、使う画面を開いたときに読む。
 * 語・読み・やさしい日本語の説明は core.json、訳は言語ごとのファイル（data/glossary/、scripts/build-glossary.ts）。
 */
import { shallowRef } from "vue";
import {
  buildIndex,
  splitByTerms,
  termsIn,
  type GlossCore,
  type GlossEntry,
  type GlossIndex,
  type GlossSource,
  type GlossTr,
} from "../../shared/glossary.ts";

const trFiles = import.meta.glob<GlossTr>("../../data/glossary/{en,zh,vi,tl,ne,id,pt,ko,my}.json", {
  import: "default",
});

export interface Glossary {
  index: GlossIndex;
  sources: Map<string, GlossSource>;
}

/** 読み込んだ用語集（まだなら null） */
export const glossary = shallowRef<Glossary | null>(null);
/** 読み込んだ訳（言語 → 表） */
export const glossTrs = shallowRef<Record<string, GlossTr>>({});

let loading: Promise<void> | null = null;
export function loadGlossary(): Promise<void> {
  loading ??= import("../../data/glossary/core.json")
    .then((m) => {
      const core = m.default as unknown as GlossCore;
      glossary.value = {
        index: buildIndex(core.entries),
        sources: new Map(core.sources.map((s) => [s.id, s])),
      };
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

const trLoading = new Map<string, Promise<void>>();
/** その言語の訳を読む（日本語・やさしい日本語は訳が要らない） */
export function loadGlossTr(lang: string): Promise<void> {
  const file = trFiles[`../../data/glossary/${lang}.json`];
  if (!file) return Promise.resolve();
  let p = trLoading.get(lang);
  if (!p) {
    p = file()
      .then((tr) => {
        glossTrs.value = { ...glossTrs.value, [lang]: tr };
      })
      .catch(() => {
        trLoading.delete(lang);
      });
    trLoading.set(lang, p);
  }
  return p;
}

/** 文を語とそれ以外に分ける（用語集がまだなら、分けない） */
export function termParts(text: string): { text: string; id?: string }[] {
  const g = glossary.value;
  return g ? splitByTerms(text, g.index) : [{ text }];
}

/** いくつかの文に出てくる語 */
export function termsOf(texts: string[]): GlossEntry[] {
  const g = glossary.value;
  return g ? termsIn(texts, g.index) : [];
}

export function termById(id: string): GlossEntry | undefined {
  return glossary.value?.index.byId.get(id);
}
