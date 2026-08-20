import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../core/env.js";
import type { NarratorBackend } from "./narrator.js";

/**
 * The two narrator backends, deliberately interchangeable: the doctrine
 * test is that swapping them changes only the wording of the narrative,
 * never a verdict, a seal or a hash. Neither is a dependency of the core
 * - an absent or unreachable backend degrades the FEATURE (no prose),
 * never the engine.
 *
 * Configuration (all optional):
 *   VELO_NARRATOR         "ollama" | "anthropic" | anything else = off
 *   VELO_OLLAMA_HOST      default http://localhost:11434
 *   VELO_OLLAMA_MODEL     default llama3.2
 *   VELO_ANTHROPIC_MODEL  default claude-opus-4-8
 *   ANTHROPIC_API_KEY     resolved by the SDK (env, or an `ant auth login` profile)
 */

export class OllamaBackend implements NarratorBackend {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(model?: string, baseUrl?: string) {
    this.model = model ?? getEnv("VELO_OLLAMA_MODEL") ?? "llama3.2";
    this.baseUrl = (baseUrl ?? getEnv("VELO_OLLAMA_HOST") ?? "http://localhost:11434").replace(/\/$/, "");
  }

  async generate(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });
    if (!res.ok) {
      throw new Error(`Ollama narrator failed: HTTP ${res.status} from ${this.baseUrl} (model ${this.model})`);
    }
    const data = (await res.json()) as { response?: string };
    if (typeof data.response !== "string") {
      throw new Error("Ollama narrator failed: response payload carried no text");
    }
    return data.response;
  }
}

export class AnthropicBackend implements NarratorBackend {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(model?: string, client?: Anthropic) {
    this.model = model ?? getEnv("VELO_ANTHROPIC_MODEL") ?? "claude-opus-4-8";
    // Zero-arg client: the SDK resolves ANTHROPIC_API_KEY / auth profile itself.
    this.client = client ?? new Anthropic();
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (text.trim().length === 0) {
      throw new Error(`Anthropic narrator returned no text (stop_reason: ${response.stop_reason})`);
    }
    return text;
  }
}

/**
 * Resolve the configured narrator, or null when narration is off or
 * unconfigured. Null is a documented, honest state - the analysis and
 * seal are complete without prose - so callers report "no narrator
 * configured" instead of failing.
 */
export function resolveNarrator(): NarratorBackend | null {
  const which = (getEnv("VELO_NARRATOR") ?? "").toLowerCase();
  if (which === "ollama") return new OllamaBackend();
  if (which === "anthropic") return new AnthropicBackend();
  return null;
}
