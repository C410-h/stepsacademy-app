import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GenerateType = "exercises" | "vocabulary" | "grammar";

function buildPrompt(generate: GenerateType[], teacherInstructions: string | null): string {
  const sections: string[] = [];

  if (generate.includes("exercises")) {
    sections.push(`  "exercises": [
    {
      "type": "fill_blank" | "association" | "rewrite" | "dialogue" | "production",
      "question": "texto da pergunta (use [___] para lacunas em fill_blank)",
      "options": [{"left": "palavra", "right": "tradução"}] somente para type association, null para outros tipos,
      "answer": "resposta correta",
      "explanation": "explicação opcional"
    }
    // gerar entre 5 e 8 exercícios variados cobrindo o conteúdo da aula
  ]`);
  }

  if (generate.includes("vocabulary")) {
    sections.push(`  "vocabulary": [
    {
      "word": "palavra no idioma ensinado",
      "translation": "tradução em português",
      "example_sentence": "frase de exemplo natural com a palavra em contexto",
      "part_of_speech": "noun" | "verb" | "adjective" | "adverb" | "expression" | "other",
      "difficulty": 1 | 2 | 3,
      "distractors": ["tradução errada 1", "tradução errada 2", "tradução errada 3"]
    }
    // extrair entre 8 e 15 palavras-chave do vocabulário da aula
  ]`);
  }

  if (generate.includes("grammar")) {
    sections.push(`  "grammar": [
    {
      "title": "Nome claro e conciso da regra gramatical",
      "explanation": "Explicação didática em português, clara para estudantes",
      "examples": [
        {
          "sentence": "Frase de exemplo no idioma ensinado",
          "translation": "Tradução em português",
          "highlight": "parte da frase a destacar (a estrutura gramatical em si)"
        }
      ],
      "tip": "Dica prática e memorável para o aluno (opcional)"
    }
    // extrair entre 1 e 3 regras gramaticais principais abordadas na aula
  ]`);
  }

  const instructionsNote = teacherInstructions
    ? `\n\nInstruções específicas do professor: ${teacherInstructions}`
    : "";

  return `Você é um assistente pedagógico especializado em criar materiais de ensino de idiomas.
Analise o documento/slide abaixo e gere o conteúdo pedagógico solicitado em formato JSON.

Retorne APENAS um objeto JSON válido, sem texto adicional, sem markdown, sem backticks:
{
${sections.join(",\n")}
}${instructionsNote}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let submissionFileId: string | undefined;

  try {
    const body = await req.json();
    const {
      slide_url,
      raw_document_url,
      teacher_instructions,
      fileUrl: legacyFileUrl,
      submissionFileId: sfId,
      generate = ["exercises"],
      step_id: _step_id,
      level_id: _level_id,
      unit_id: _unit_id,
    } = body;
    submissionFileId = sfId;

    const fileUrl: string | undefined = slide_url || raw_document_url || legacyFileUrl;

    if (!fileUrl) {
      return new Response(
        JSON.stringify({ error: "Forneça slide_url ou raw_document_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const EXTRACTION_PROMPT = buildPrompt(generate as GenerateType[], teacher_instructions || null);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Update status → converting
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ ai_conversion_status: "converting" })
        .eq("id", submissionFileId);
    }

    // Fetch file
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Falha ao buscar arquivo: ${fileRes.status}`);

    const contentType = fileRes.headers.get("content-type") || "";
    const isPdf = contentType.includes("pdf") || fileUrl.toLowerCase().endsWith(".pdf");

    let content: any[];

    if (isPdf) {
      const buffer = await fileRes.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      // Chunked base64 encoding — evita OOM com PDFs grandes (O(n) em vez de O(n²))
      const CHUNK = 32768;
      let binary = "";
      for (let offset = 0; offset < uint8.length; offset += CHUNK) {
        binary += String.fromCharCode(...uint8.subarray(offset, offset + CHUNK));
      }
      const base64 = btoa(binary);
      content = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        },
        {
          type: "text",
          text: EXTRACTION_PROMPT + "\n\nAnalise o documento acima e gere o conteúdo solicitado.",
        },
      ];
    } else {
      let text: string;
      try {
        const raw = await fileRes.text();
        text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30000);
      } catch {
        text = "[Conteúdo não pôde ser extraído]";
      }
      content = [{ type: "text", text: `${EXTRACTION_PROMPT}\n\nDocumento:\n${text}` }];
    }

    // Update status → processing
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ ai_conversion_status: "processing" })
        .eq("id", submissionFileId);
    }

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("[convert-exercises-ai] Anthropic error:", claudeRes.status, err);
      throw new Error(`Anthropic API error ${claudeRes.status}: ${err}`);
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData.content?.[0]?.text || "{}";

    // Parse response — handle both legacy array and new object format
    let result: { exercises?: any[]; vocabulary?: any[]; grammar?: any[] };
    try {
      const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        result = { exercises: parsed, vocabulary: [], grammar: [] };
      } else {
        result = {
          exercises: parsed.exercises || [],
          vocabulary: parsed.vocabulary || [],
          grammar: parsed.grammar || [],
        };
      }
    } catch {
      throw new Error("Claude retornou JSON inválido: " + rawText.slice(0, 200));
    }

    // Save result to submission_files
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ exercises: result, ai_conversion_status: "done" })
        .eq("id", submissionFileId);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[convert-exercises-ai] erro:", error.message);

    if (submissionFileId) {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        await sb.from("submission_files")
          .update({ ai_conversion_status: "failed" })
          .eq("id", submissionFileId);
      } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
