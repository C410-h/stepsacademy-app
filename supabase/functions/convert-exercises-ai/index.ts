import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fileUrl, submissionFileId } = await req.json();

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the file content (PDF/DOC)
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      throw new Error(`Could not fetch file: ${fileRes.status}`);
    }

    // Get file as base64 (for PDF) or text (for plain text)
    const contentType = fileRes.headers.get("content-type") || "";
    let fileContent: string;
    let isBase64 = false;

    if (contentType.includes("pdf") || fileUrl.endsWith(".pdf")) {
      const buffer = await fileRes.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      // Convert to base64
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      fileContent = btoa(binary);
      isBase64 = true;
    } else {
      fileContent = await fileRes.text();
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

    // Build the Anthropic API request
    const messages: any[] = [];

    if (isBase64) {
      messages.push({
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: fileContent,
            },
          },
          {
            type: "text",
            text: `Analise este documento e extraia todos os exercícios de idioma que encontrar.

Para cada exercício, retorne um objeto JSON com os campos:
- type: "fill_blank" (preencher lacuna), "association" (associar/ligar), ou "open_answer" (resposta aberta)
- question: o enunciado ou frase com ___ para lacunas
- options: string com opções separadas por vírgula (apenas para association)
- answer: a resposta correta. Para association, use o formato "A=B,C=D"
- explanation: explicação da resposta (opcional, pode ser vazio)

Retorne APENAS um JSON válido no formato:
{"exercises": [...]}

Não inclua nenhum texto fora do JSON.`,
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Analise este conteúdo de exercícios de idioma e extraia todos os exercícios.

CONTEÚDO:
${fileContent}

Para cada exercício, retorne um objeto JSON com os campos:
- type: "fill_blank" (preencher lacuna), "association" (associar/ligar), ou "open_answer" (resposta aberta)
- question: o enunciado ou frase com ___ para lacunas
- options: string com opções separadas por vírgula (apenas para association)
- answer: a resposta correta. Para association, use o formato "A=B,C=D"
- explanation: explicação da resposta (opcional, pode ser vazio)

Retorne APENAS um JSON válido no formato:
{"exercises": [...]}

Não inclua nenhum texto fora do JSON.`,
      });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text || "{}";

    // Parse JSON from response
    let parsed: { exercises: any[] };
    try {
      // Sometimes the model wraps in ```json ... ```
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ||
        rawText.match(/```\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      throw new Error("Anthropic returned invalid JSON: " + rawText.slice(0, 200));
    }

    const exercises = parsed.exercises || [];

    // Update submission_files with AI conversion status
    if (submissionFileId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      await sb
        .from("submission_files")
        .update({
          exercises,
          ai_conversion_status: "done",
        })
        .eq("id", submissionFileId);
    }

    return new Response(JSON.stringify({ exercises }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("convert-exercises-ai error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
