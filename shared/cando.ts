import data from "../data/cando.json" with { type: "json" };
import type { CanDo, CandoData, SocialInfo } from "./types.ts";

const DATA = data as CandoData;

export function findCando(no: number): CanDo | undefined {
  return DATA.candos.find((c) => c.no === no);
}

export function findSocial(nos: number[]): SocialInfo[] {
  return DATA.social.filter((s) => nos.includes(s.no));
}

export function findSocialByMinor(minorNo: string): SocialInfo[] {
  return DATA.social.filter((s) => s.minorNo === minorNo);
}

export function allCandos(): CanDo[] {
  return DATA.candos;
}

export const CANDO_VERSION = DATA.version;
