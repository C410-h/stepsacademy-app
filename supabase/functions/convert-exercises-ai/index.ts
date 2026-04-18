import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_PROMPT = `Você é um assistente pedagógico especializado em criar exercícios de idiomas.
Analise o documento abaixo e extraia ou crie exercícios no formato JSON.

Retorne APENAS um array JSON válido, sem nenhum texto adicional, sem markdown, sem backticks:
[
  {
    "type": "fill_blank" | "association" | "rewrite" | "dialogue" | "production",
    "question": "texto da pergunta",
    "options": ["opção1", "opção2", "opção3", "opção4"] ou null,
    "answer": "resposta correta",
    "explanation": "explicação opcional"
  }
]`;

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
    } = body;
    submissionFileId = sfId;

    const fileUrl: string | undefined = slide_url || raw_document_url || legacyFileUrl;

    if (!fileUrl) {
      return new Response(
        JSON.stringify({ error: "Forneça slide_url ou raw_document_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const instructionsNote = teacher_instructions
      ? `\n\nInstruções do professor: ${teacher_instructions}`
      : "";
    const EXTRACTION_PROMPT = BASE_PROMPT + instructionsNote;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Atualiza status → converting
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ ai_conversion_status: "converting" })
        .eq("id", submissionFileId);
    }

    // Fetch do arquivo
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Falha ao buscar arquivo: ${fileRes.status}`);

    const contentType = fileRes.headers.get("content-type") || "";
    const isPdf = contentType.includes("pdf") || fileUrl.toLowerCase().endsWith(".pdf");

    let content: any[];

    if (isPdf) {
      // PDF → base64 para Claude
      const buffer = await fileRes.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      content = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        },
        {
          type: "text",
          text: EXTRACTION_PROMPT + "\n\nExtrai os exercícios do documento acima.",
        },
      ];
    } else {
      // DOCX, TXT → extrai texto bruto
      let text: string;
      try {
        const raw = await fileRes.text();
        text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30000);
      } catch {
        text = "[Conteúdo não pôde ser extraído]";
      }
      content = [{ type: "text", text: `${EXTRACTION_PROMPT}\n\nDocumento:\n${text}` }];
    }

    // Atualiza status → processing
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ ai_conversion_status: "processing" })
        .eq("id", submissionFileId);
    }

    // Chama Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData.content?.[0]?.text || "[]";

    // Parse da resposta
    let exercises: any[];
    try {
      const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      exercises = Array.isArray(parsed) ? parsed : (parsed.exercises || []);
    } catch {
      throw new Error("Claude retornou JSON inválido: " + rawText.slice(0, 200));
    }

    // Salva resultado e atualiza status → done
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ exercises, ai_conversion_status: "done" })
        .eq("id", submissionFileId);
    }

    return new Response(JSON.stringify({ exercises }), {
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
