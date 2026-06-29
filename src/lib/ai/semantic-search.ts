/**
 * Servico de Busca Semantica usando OpenRouter
 *
 * Usa Qwen3 Embedding para gerar embeddings e busca por similaridade de cosseno
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const EMBEDDING_MODEL = "qwen/qwen3-embedding-0.6b"; // Modelo leve e eficiente
const RERANK_MODEL = "qwen/qwen3-embedding-8b"; // Modelo maior para rerank

export interface EmbeddingResult {
  text: string;
  embedding: number[];
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SegmentWithEmbedding {
  id: string;
  text: string;
  topic?: string;
  embedding?: number[];
  startTime: number;
  endTime: number;
}

/**
 * Calcula similaridade de cosseno entre dois vetores
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Classe principal de busca semantica
 */
export class SemanticSearchService {
  private apiKey: string;
  private embeddingModel: string;
  private rerankModel: string;
  private cache: Map<string, number[]> = new Map();

  constructor(options?: {
    apiKey?: string;
    embeddingModel?: string;
    rerankModel?: string;
  }) {
    this.apiKey = options?.apiKey || OPENROUTER_API_KEY;
    this.embeddingModel = options?.embeddingModel || EMBEDDING_MODEL;
    this.rerankModel = options?.rerankModel || RERANK_MODEL;
  }

  /**
   * Gera embedding para um texto
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      console.warn("[SemanticSearch] No API key configured, returning empty embedding");
      return [];
    }

    // Check cache first
    const cached = this.cache.get(text);
    if (cached) return cached;

    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://aeropod.app",
        "X-Title": "AeroPod Editor",
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate embedding: ${error}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding as number[];

    // Cache the result
    this.cache.set(text, embedding);

    return embedding;
  }

  /**
   * Gera embeddings para multiplos textos em batch
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.apiKey) {
      console.warn("[SemanticSearch] No API key configured, returning empty embeddings");
      return texts.map(text => ({ text, embedding: [] }));
    }

    // Filter out already cached texts
    const uncachedTexts = texts.filter(t => !this.cache.has(t));

    if (uncachedTexts.length > 0) {
      const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://aeropod.app",
          "X-Title": "AeroPod Editor",
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: uncachedTexts,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to generate embeddings: ${error}`);
      }

      const data = await response.json();

      // Cache results
      for (let i = 0; i < uncachedTexts.length; i++) {
        this.cache.set(uncachedTexts[i], data.data[i].embedding);
      }
    }

    // Return all embeddings (from cache)
    return texts.map(text => ({
      text,
      embedding: this.cache.get(text)!,
    }));
  }

  /**
   * Busca semantica em uma lista de segmentos
   */
  async search(
    query: string,
    segments: SegmentWithEmbedding[],
    options?: {
      topK?: number;
      minScore?: number;
      useRerank?: boolean;
    }
  ): Promise<SearchResult[]> {
    const topK = options?.topK ?? 10;
    const minScore = options?.minScore ?? 0.3;
    const useRerank = options?.useRerank ?? false;

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Without a valid embedding we cannot compute similarity — return empty results
    if (queryEmbedding.length === 0) {
      return [];
    }

    // Generate embeddings for segments that don't have them
    const segmentsNeedingEmbeddings = segments.filter(s => !s.embedding);
    if (segmentsNeedingEmbeddings.length > 0) {
      const texts = segmentsNeedingEmbeddings.map(s => s.text);
      const embeddings = await this.generateEmbeddings(texts);

      for (let i = 0; i < segmentsNeedingEmbeddings.length; i++) {
        segmentsNeedingEmbeddings[i].embedding = embeddings[i].embedding;
      }
    }

    // Calculate similarity scores
    let results: SearchResult[] = segments
      .filter(s => s.embedding && s.embedding.length > 0)
      .map(segment => ({
        id: segment.id,
        text: segment.text,
        score: cosineSimilarity(queryEmbedding, segment.embedding!),
        metadata: {
          topic: segment.topic,
          startTime: segment.startTime,
          endTime: segment.endTime,
        },
      }))
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, useRerank ? topK * 2 : topK); // Get more for rerank

    // Rerank if enabled
    if (useRerank && results.length > 0) {
      results = await this.rerank(query, results, topK);
    }

    return results.slice(0, topK);
  }

  /**
   * Rerank results usando modelo maior
   */
  private async rerank(
    query: string,
    results: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    // Use chat completion to rerank
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://aeropod.app",
        "X-Title": "AeroPod Editor",
      },
      body: JSON.stringify({
        model: "qwen/qwen-2.5-72b-instruct", // Modelo de chat para rerank
        messages: [
          {
            role: "system",
            content: `Voce e um sistema de reranking. Dado uma query e uma lista de textos, retorne os indices dos textos mais relevantes em ordem de relevancia.
Retorne APENAS um JSON array com os indices, ex: [2, 0, 4, 1, 3]`,
          },
          {
            role: "user",
            content: `Query: "${query}"

Textos:
${results.map((r, i) => `[${i}] ${r.text.substring(0, 200)}`).join("\n")}

Retorne os indices dos ${topK} textos mais relevantes para a query, em ordem de relevancia:`,
          },
        ],
        temperature: 0,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      // Fallback to original order if rerank fails
      return results;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "[]";

    try {
      const indices = JSON.parse(content.match(/\[[\d,\s]+\]/)?.[0] || "[]") as number[];
      const reranked = indices
        .filter(i => i >= 0 && i < results.length)
        .map(i => results[i]);

      // Add any results not in reranked list
      for (const r of results) {
        if (!reranked.find(rr => rr.id === r.id)) {
          reranked.push(r);
        }
      }

      return reranked;
    } catch {
      return results;
    }
  }

  /**
   * Limpa o cache de embeddings
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Retorna o tamanho do cache
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Singleton instance
let instance: SemanticSearchService | null = null;

export function getSemanticSearchService(): SemanticSearchService {
  if (!instance) {
    instance = new SemanticSearchService();
  }
  return instance;
}
