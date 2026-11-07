<script setup lang="ts">
/**
 * 評価の正解を、作り手（日本語教師）が確かめて直す道具（/dev/gold）。
 *
 * 会話ごとに、本番の前に直してほしい所（赤。多くても3つ、直す順）と、直さなくていい所を決める。
 * いちばん新しい評価で Claude が入れた赤を横に出し、食い違う所が見えるようにする。
 * 直した内容はこのブラウザに残り、「書き出す」で JSON にする（scripts/apply-gold.ts で eval/cases に入れる）。
 * サーバーには何も送らない。画面の言葉は日本語だけ（作り手用）。
 */
import { computed, onMounted, reactive, ref, watch } from "vue";
import { checkGold, KIND_LABEL, KINDS, type GoldExport } from "../../eval/gold.ts";
import {
  matches,
  overlaps,
  type EvalCase,
  type GoldMark,
  type NoMark,
  type PredMark,
} from "../../eval/score.ts";
import { findScene } from "../../shared/scenes.ts";

interface ResultFile {
  promptVersion: string;
  model: string;
  effort: string;
  runs: number;
  outputs: {
    run: number;
    id: string;
    akapen: {
      marks: (PredMark & { why?: string; next?: string })[];
      later: { turn: number; quote: string; note: string }[];
    };
  }[];
}

interface Draft {
  marks: GoldMark[];
  noMark: NoMark[];
  note: string;
  confirmed: boolean;
}

const CASES: EvalCase[] = Object.values(
  import.meta.glob<EvalCase>("../../eval/cases/*.json", { eager: true, import: "default" }),
).sort((a, b) => a.id.localeCompare(b.id));

const resultLoaders = import.meta.glob<ResultFile>("../../eval/results/*.json", {
  import: "default",
});
const latestKey = Object.keys(resultLoaders).sort().at(-1);
const result = ref<ResultFile | null>(null);
onMounted(async () => {
  document.title = "評価の正解を確かめる | JAWS";
  if (latestKey) result.value = await resultLoaders[latestKey]!();
});

/** 作り手に決めてほしいこと（docs/eval.md の「残っている食い違い」） */
const QUESTIONS: Record<string, string> = {
  "clinic-1":
    "「保険証」に「はい、わかりました」とだけ答えた所（今の正解の2番）。分からなかった証拠が会話に無いので、Claude は赤を入れません。用件に欠かせない語なら、「はい」だけでも赤を入れますか。",
  "sodai-1":
    "「家電リサイクル」を聞き返さずに「だいじょうぶです」と答えた所（今の正解の2番）。Claude は1番の「だいじょうぶです」だけにします。別の赤として入れますか。",
  "sodai-2":
    "「処理券」に「はい」とだけ答えた所（今の正解の1番）。Claude は赤を入れません。「はい」だけでも赤を入れますか。",
  "taxi-1":
    "正解は「わからない。」（話が止まる）。Claude は「公園、あります。」（目印があいまい）を1番にし、「わからない。」を「失礼」とします。本番で困るのはどちらですか。",
  "taxi-2":
    "正解は相手の「お迎えの場所」（聞き取れていない）。Claude は学習者のずれた答え「みなと駅です。」（話が止まる）に赤を入れることがあります（今は同じつまずきとして合うとしています）。どちらに入れるのが先生らしいですか。",
  "restaurant-2":
    "「4人です。子どもが1人います。」は、大人4人と子ども1人（5人）と取られるかもしれません（この会話では相手は4名と受け取りました）。赤を入れますか。",
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const fresh = (c: EvalCase): Draft => ({
  marks: clone(c.gold.marks),
  noMark: clone(c.gold.noMark),
  note: c.goldNote ?? "",
  confirmed: c.goldBy === "teacher",
});

const STORAGE = "akapen.gold.v1";
function load(): Record<string, Draft> {
  const base: Record<string, Draft> = Object.fromEntries(CASES.map((c) => [c.id, fresh(c)]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "null") as Record<
      string,
      Draft
    > | null;
    if (saved) for (const id of Object.keys(base)) if (saved[id]) base[id] = saved[id];
  } catch {
    // 読めなくても、元の正解から始める
  }
  return base;
}
const drafts = reactive<Record<string, Draft>>(load());
watch(
  drafts,
  () => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(drafts));
    } catch {
      // 残せなくても、書き出しはできる
    }
  },
  { deep: true },
);

const currentId = ref(CASES[0]?.id ?? "");
const index = computed(() => CASES.findIndex((c) => c.id === currentId.value));
const cur = computed(() => CASES[index.value]!);
const draft = computed(() => drafts[currentId.value]!);
const scene = computed(() => findScene(cur.value.sceneId));
const goldNow = computed(() => draft.value.marks.map((m, i) => ({ ...m, rank: i + 1 })));
const problems = computed(() =>
  checkGold(cur.value, { marks: goldNow.value, noMark: draft.value.noMark }),
);
const hasError = (c: EvalCase) =>
  checkGold(c, { marks: drafts[c.id]!.marks, noMark: drafts[c.id]!.noMark }).some(
    (p) => p.level === "error",
  );
const done = computed(() => CASES.filter((c) => drafts[c.id]!.confirmed).length);

function go(d: number) {
  const next = CASES[index.value + d];
  if (next) {
    currentId.value = next.id;
    window.scrollTo({ top: 0 });
  }
}

// ───── 会話から赤・直さない を足す ─────
const textEls: Record<number, HTMLElement | null> = {};
function setTextEl(i: number, el: unknown) {
  textEls[i] = el instanceof HTMLElement ? el : null;
}
/** その発話の中で文字をなぞって選んでいれば、その部分。無ければ発話全体 */
function quoteFor(i: number): string {
  const text = cur.value.turns[i]!.text;
  const sel = window.getSelection();
  const el = textEls[i];
  if (sel && !sel.isCollapsed && el && sel.rangeCount) {
    const picked = sel.toString().trim();
    if (el.contains(sel.getRangeAt(0).commonAncestorContainer) && picked && text.includes(picked))
      return picked;
  }
  return text;
}
function addMark(i: number) {
  const t = cur.value.turns[i]!;
  draft.value.marks.push({
    rank: draft.value.marks.length + 1,
    kind: t.speaker === "partner" ? "missed" : "stalled",
    turn: i,
    quote: quoteFor(i),
  });
}
function addNoMark(i: number) {
  draft.value.noMark.push({ turn: i, quote: quoteFor(i), reason: "" });
}
function move<T>(list: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  const [x] = list.splice(i, 1);
  list.splice(j, 0, x!);
}
function reset() {
  if (confirm(`${cur.value.id} を、元の正解（リポジトリの内容）に戻しますか。`))
    drafts[cur.value.id] = fresh(cur.value);
}

const marksAt = (i: number) => goldNow.value.filter((m) => m.turn === i).map((m) => m.rank);
const noMarkAt = (i: number) => draft.value.noMark.some((n) => n.turn === i);

// ───── Claude の赤（いちばん新しい評価）─────
const runs = computed(() =>
  (result.value?.outputs ?? [])
    .filter((o) => o.id === currentId.value)
    .sort((a, b) => a.run - b.run),
);
const claudeAt = (i: number) => runs.value.some((r) => r.akapen.marks.some((m) => m.turn === i));
function status(p: PredMark): { label: string; cls: string } {
  const g = goldNow.value.find((x) => matches(x, p));
  if (g)
    return g.kind === p.kind
      ? { label: `正解の${g.rank}番と合う`, cls: "hit" }
      : {
          label: `正解の${g.rank}番と合う（種類が違う: 正解は${KIND_LABEL[g.kind]}）`,
          cls: "kind",
        };
  if (draft.value.noMark.some((n) => overlaps(n, p)))
    return { label: "「直さない」に入れた所", cls: "bad" };
  return { label: "正解に無い（入れすぎ）", cls: "extra" };
}
const missedBy = (marks: PredMark[]) =>
  goldNow.value.filter((g) => !marks.some((p) => matches(g, p)));

// ───── 書き出す ─────
function exportData(): GoldExport {
  return {
    kind: "akapen-gold",
    version: 1,
    exportedAt: new Date().toISOString(),
    cases: CASES.map((c) => {
      const d = drafts[c.id]!;
      return {
        id: c.id,
        goldBy: d.confirmed ? "teacher" : c.goldBy === "teacher" ? "draft" : c.goldBy,
        gold: { marks: d.marks.map((m, i) => ({ ...m, rank: i + 1 })), noMark: d.noMark },
        goldNote: d.note.trim() || undefined,
      };
    }),
  };
}
function download() {
  const blob = new Blob([JSON.stringify(exportData(), null, 2) + "\n"], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gold-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(exportData(), null, 2));
    copied.value = true;
    setTimeout(() => (copied.value = false), 2500);
  } catch {
    alert("コピーできませんでした。「ファイルに書き出す」を使ってください。");
  }
}
</script>

<template>
  <section class="gold">
    <h1>評価の正解を確かめる</h1>
    <p class="muted small">
      作り手（日本語教師）用。Claude
      の赤ペンを測るための「正解」を、会話ごとに決めます。会話はすべて架空です。
    </p>
    <details class="how card" open>
      <summary>やること</summary>
      <ol>
        <li>
          会話を読み、本番の前に直してほしい所の「<strong>赤</strong>」を押す。多くても3つ、直す順に並べる（↑↓）。
        </li>
        <li>
          直さなくていい所（言いよどみ、伝わった文法の誤り）は「<strong>直さない</strong>」を押す。Claude
          がここに赤を入れたら減点になる。
        </li>
        <li>
          「Claude
          の赤」は、いちばん新しい評価の結果。違う所の理由を「メモ」に書いてもらえると、Claude
          の指示を直すのに使える。
        </li>
        <li>
          確かめたら「この会話を確かめた」に印。全部終わったら「ファイルに書き出す」→
          チャットに送る。Claude Code が正解に入れて、評価を測り直す。
        </li>
      </ol>
      <p class="small muted">
        引用は、会話の文字をなぞって選んでからボタンを押すと、その部分だけになる（あとで書き直してもよい）。直した内容は、このブラウザに自動で残る。
      </p>
    </details>

    <div class="bar">
      <span class="small">確かめた {{ done }} / {{ CASES.length }}</span>
      <button class="btn red small" type="button" @click="download">ファイルに書き出す</button>
      <button class="btn ghost small" type="button" @click="copy">
        {{ copied ? "コピーしました" : "コピー" }}
      </button>
    </div>

    <nav class="tabs" aria-label="会話">
      <button
        v-for="c in CASES"
        :key="c.id"
        type="button"
        :class="{ on: c.id === currentId, ok: drafts[c.id]!.confirmed, err: hasError(c) }"
        @click="currentId = c.id"
      >
        {{ drafts[c.id]!.confirmed ? "✓ " : "" }}{{ c.id }}
      </button>
    </nav>

    <header class="case-head">
      <h2>{{ cur.id }}・{{ scene?.title ?? cur.sceneId }}</h2>
      <p class="small"><span class="muted">この会話のねらい:</span> {{ cur.note }}</p>
      <p v-if="QUESTIONS[cur.id]" class="question">
        <strong>決めてほしいこと</strong> {{ QUESTIONS[cur.id] }}
      </p>
    </header>

    <div class="cols">
      <ol class="talk card">
        <li v-for="(t, i) in cur.turns" :key="i" :class="['turn', t.speaker]">
          <div class="who small muted">
            {{ i }}. {{ t.speaker === "me" ? "学習者" : "相手" }}
            <span v-for="r in marksAt(i)" :key="r" class="tag red">赤{{ r }}</span>
            <span v-if="noMarkAt(i)" class="tag gray">直さない</span>
            <span v-if="claudeAt(i)" class="tag claude">Claude</span>
          </div>
          <p :ref="(el) => setTextEl(i, el)" class="text">{{ t.text }}</p>
          <div class="acts">
            <button class="mini red" type="button" @click="addMark(i)">
              {{ t.speaker === "partner" ? "赤（聞き取れていない）" : "赤" }}
            </button>
            <button v-if="t.speaker === 'me'" class="mini" type="button" @click="addNoMark(i)">
              直さない
            </button>
          </div>
        </li>
      </ol>

      <div class="side">
        <section class="card">
          <h3>赤（正解）<span class="muted small">直す順。多くても3つ</span></h3>
          <p v-if="!draft.marks.length" class="small muted">赤なし（直すことが無い会話）</p>
          <ol class="edit">
            <li v-for="(m, i) in draft.marks" :key="i">
              <div class="row">
                <span class="num">{{ i + 1 }}</span>
                <select v-model="m.kind" aria-label="種類">
                  <option v-for="k in KINDS" :key="k" :value="k">{{ KIND_LABEL[k] }}</option>
                </select>
                <span class="small muted">{{ m.turn }}番</span>
                <span class="grow" />
                <button
                  class="mini"
                  type="button"
                  :disabled="i === 0"
                  @click="move(draft.marks, i, -1)"
                >
                  ↑
                </button>
                <button
                  class="mini"
                  type="button"
                  :disabled="i === draft.marks.length - 1"
                  @click="move(draft.marks, i, 1)"
                >
                  ↓
                </button>
                <button
                  class="mini"
                  type="button"
                  aria-label="消す"
                  @click="draft.marks.splice(i, 1)"
                >
                  ×
                </button>
              </div>
              <input v-model="m.quote" class="quote" aria-label="引用" />
              <p v-if="m.alt?.length" class="small muted">
                同じつまずきとして合うとする所:
                <span v-for="a in m.alt" :key="a.turn + a.quote"
                  >{{ a.turn }}番「{{ a.quote }}」</span
                >
              </p>
            </li>
          </ol>
        </section>

        <section class="card">
          <h3>直さない<span class="muted small">Claude が赤を入れたら減点</span></h3>
          <p v-if="!draft.noMark.length" class="small muted">なし</p>
          <ul class="edit">
            <li v-for="(n, i) in draft.noMark" :key="i">
              <div class="row">
                <span class="small muted">{{ n.turn }}番</span>
                <input v-model="n.quote" class="quote grow" aria-label="引用" />
                <button
                  class="mini"
                  type="button"
                  aria-label="消す"
                  @click="draft.noMark.splice(i, 1)"
                >
                  ×
                </button>
              </div>
              <input
                v-model="n.reason"
                class="quote"
                list="reasons"
                placeholder="理由（例: 言いよどみ）"
                aria-label="理由"
              />
            </li>
          </ul>
          <datalist id="reasons">
            <option value="言いよどみ" />
            <option value="言い直し" />
            <option value="文法の誤りだが伝わった" />
            <option value="前後で意味が決まる" />
          </datalist>
        </section>

        <ul v-if="problems.length" class="problems">
          <li v-for="p in problems" :key="p.message" :class="p.level">{{ p.message }}</li>
        </ul>

        <section class="card">
          <h3>
            Claude の赤
            <span v-if="result" class="muted small"
              >評価 {{ result.promptVersion }}・{{ result.runs }}回</span
            >
          </h3>
          <p v-if="!result" class="small muted">読み込んでいます…</p>
          <p v-else-if="!runs.length" class="small muted">この会話は、まだ評価していません。</p>
          <div v-for="r in runs" :key="r.run" class="run">
            <p class="small">
              <strong>{{ r.run + 1 }}回目</strong>
            </p>
            <p v-if="!r.akapen.marks.length" class="small muted">赤なし</p>
            <ul>
              <li v-for="p in r.akapen.marks" :key="p.priority" class="small">
                {{ p.priority }}. {{ KIND_LABEL[p.kind] }}・{{ p.turn }}番「{{ p.quote }}」
                <span :class="['st', status(p).cls]">{{ status(p).label }}</span>
                <span v-if="p.why" class="why muted">{{ p.why }}</span>
              </li>
              <li v-for="g in missedBy(r.akapen.marks)" :key="'m' + g.rank" class="small">
                <span class="st extra">Claude が入れなかった</span> 正解の{{ g.rank }}番・{{
                  g.turn
                }}番「{{ g.quote }}」
              </li>
            </ul>
            <details v-if="r.akapen.later.length" class="small">
              <summary>
                Claude が「今は直さなくていい」に入れた所（{{ r.akapen.later.length }}）
              </summary>
              <ul>
                <li v-for="l in r.akapen.later" :key="l.turn + l.quote">
                  {{ l.turn }}番「{{ l.quote }}」→ {{ l.note }}
                </li>
              </ul>
            </details>
          </div>
        </section>

        <section class="card">
          <h3>メモ<span class="muted small">判断の理由（あれば）</span></h3>
          <textarea
            v-model="draft.note"
            rows="3"
            placeholder="例: 「はい」だけでも、処理券が分からないと当日ごみを出せないので赤。"
          />
          <label class="confirm">
            <input v-model="draft.confirmed" type="checkbox" />
            この会話を確かめた
          </label>
          <button class="btn ghost small" type="button" @click="reset">この会話を元に戻す</button>
        </section>
      </div>
    </div>

    <nav class="pager">
      <button class="btn ghost" type="button" :disabled="index === 0" @click="go(-1)">
        前の会話
      </button>
      <button class="btn" type="button" :disabled="index === CASES.length - 1" @click="go(1)">
        次の会話
      </button>
    </nav>
  </section>
</template>

<style scoped>
.gold h1 {
  font-size: 22px;
}
.how {
  margin: 10px 0;
}
.how summary {
  cursor: pointer;
  font-weight: 700;
}
.how ol {
  margin: 8px 0;
  padding-left: 1.4em;
  display: grid;
  gap: 4px;
}
.bar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 12px 0;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.tabs button {
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink);
  padding: 3px 10px;
}
.tabs .on {
  border-color: var(--ink);
  font-weight: 700;
}
.tabs .ok {
  color: var(--ok);
}
.tabs .err {
  border-color: var(--red);
}
.case-head h2 {
  font-size: 18px;
}
.question {
  background: var(--red-soft);
  border-radius: 8px;
  padding: 8px 12px;
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  margin-top: 10px;
}
@media (max-width: 760px) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
.talk {
  list-style: none;
  margin: 0;
  display: grid;
  gap: 10px;
}
.turn .text {
  margin: 2px 0 4px;
  border-radius: 10px;
  padding: 6px 10px;
}
.turn.partner .text {
  background: var(--other);
}
.turn.me .text {
  border: 1px solid var(--line);
}
.acts {
  display: flex;
  gap: 6px;
}
.tag {
  display: inline-block;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 5px;
  margin-left: 4px;
}
.tag.red {
  background: var(--red);
  color: var(--paper);
}
.tag.gray {
  background: var(--line);
  color: var(--ink);
}
.tag.claude {
  border: 1px dashed var(--muted);
}
.mini {
  font: inherit;
  font-size: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink);
  padding: 2px 8px;
}
.mini.red {
  border-color: var(--red);
  color: var(--red);
}
.mini:disabled {
  opacity: 0.4;
}
.side {
  display: grid;
  gap: 12px;
}
.side h3 {
  font-size: 15px;
  margin-bottom: 6px;
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}
.edit {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}
.row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.grow {
  flex: 1;
}
.num {
  font-weight: 700;
  color: var(--red);
  min-width: 1.2em;
}
select,
.quote,
textarea {
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink);
  padding: 3px 6px;
}
.quote {
  width: 100%;
  margin-top: 4px;
  box-sizing: border-box;
}
.row .quote {
  margin-top: 0;
  min-width: 0;
}
textarea {
  width: 100%;
  box-sizing: border-box;
}
.problems {
  margin: 0;
  padding-left: 1.2em;
  font-size: 13px;
}
.problems .error {
  color: var(--red);
}
.problems .warn {
  color: var(--muted);
}
.run ul {
  margin: 4px 0 8px;
  padding-left: 1.1em;
  display: grid;
  gap: 4px;
}
.st {
  display: inline-block;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 5px;
}
.st.hit {
  background: var(--ok-soft);
  color: var(--ok);
}
.st.kind {
  background: var(--other);
}
.st.extra,
.st.bad {
  background: var(--red-soft);
  color: var(--red);
}
.why {
  display: block;
}
.confirm {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 8px 0;
  font-weight: 700;
}
.pager {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
</style>
