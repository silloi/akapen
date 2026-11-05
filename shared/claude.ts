/**
 * Claude API の呼び出し（Worker と Node のスクリプトで共用）。構造化出力で JSON を受け取る。
 */
import Anthropic from "@anthropic-ai/sdk";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class ClaudeError extends Error {
  readonly code: "refusal" | "max_tokens" | "invalid_json";
  constructor(message: string, code: ClaudeError["code"]) {
    super(message);
    this.code = code;
  }
}

export interface CallOptions {
  model: string;
  effort: Effort;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface CallResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function callJson<T>(client: Anthropic, o: CallOptions): Promise<CallResult<T>> {
  const message = await client.beta.messages
    .stream({
      model: o.model,
      max_tokens: o.maxTokens ?? 16000,
      // 安全分類器が断った場合は、サーバー側で推奨モデルに切り替えて続ける
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
      messages: o.messages,
      output_config: {
        effort: o.effort,
        format: { type: "json_schema", schema: o.schema },
      },
    })
    .finalMessage();

  if (message.stop_reason === "refusal") {
    throw new ClaudeError(
      `Claude が生成を断りました（${message.stop_details?.category ?? "理由不明"}）`,
      "refusal",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("出力が長すぎて途中で切れました", "max_tokens");
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new ClaudeError("JSON として読めない出力でした", "invalid_json");
  }
  return {
    data,
    model: message.model,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}
