import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT = `Você é um assistente pedagógico especializado em criar exercícios de idiomas.
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
    const { fileUrl, submissionFileId: sfId } = body;
    submissionFileId = sfId;

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    // Supabase client para atualizar status
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
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

    let parts: any[];

    if (isPdf) {
      // PDF → inline_data base64 para o Gemini
      const buffer = await fileRes.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      parts = [
        {
          inline_data: {
            mime_type: "application/pdf",
            data: base64,
          },
        },
        { text: EXTRACTION_PROMPT + "\n\nExtrai os exercícios do documento acima." },
      ];
    } else {
      // DOCX, TXT e outros → extrai texto bruto
      let text: string;
      try {
        const raw = await fileRes.text();
        // Remove tags XML (docx é um zip com XML internamente)
        text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30000);
      } catch {
        text = "[Conteúdo não pôde ser extraído]";
      }
      parts = [{ text: `${EXTRACTION_PROMPT}\n\nDocumento:\n${text}` }];
    }

    // Atualiza status → processing
    if (submissionFileId) {
      await sb.from("submission_files")
        .update({ ai_conversion_status: "processing" })
        .eq("id", submissionFileId);
    }

    // Chama Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini API error: ${err}`);
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    // Parse da resposta
    let exercises: any[];
    try {
      const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      exercises = Array.isArray(parsed) ? parsed : (parsed.exercises || []);
    } catch {
      throw new Error("Gemini retornou JSON inválido: " + rawText.slice(0, 200));
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

    // Atualiza status → failed
    if (submissionFileId) {
      try {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { autoRefreshToken: false, persistSession: false } }
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
