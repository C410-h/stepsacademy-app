import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Mic, Square, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  studentId: string;
  stepId: string;
  onSent?: () => void;
}

type RecorderState = "idle" | "recording" | "stopped" | "sending";

const MAX_SECONDS = 180; // 3 minutes

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const VoiceRecorder = ({ studentId, stepId, onSent }: VoiceRecorderProps) => {
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [noSupport, setNoSupport] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!window.MediaRecorder) {
      setNoSupport(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setPermissionError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecorderState("stopped");
      };

      mr.start(250);
      mediaRecorderRef.current = mr;
      setElapsed(0);
      setRecorderState("recording");

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= MAX_SECONDS) {
            stopRecording();
            return MAX_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        setPermissionError(true);
      }
    }
  };

  const stopRecording = () => {
    clearTimer();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleRerecord = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setRecorderState("idle");
  };

  const handleSend = async () => {
    if (!audioBlob || !studentId) return;
    setRecorderState("sending");

    try {
      const timestamp = Date.now();
      const path = `speaking/${studentId}/${timestamp}.webm`;

      const { error: uploadError } = await (supabase as any).storage
        .from("audios")
        .upload(path, audioBlob, { contentType: audioBlob.type || "audio/webm" });

      if (uploadError) throw uploadError;

      const { data: urlData } = (supabase as any).storage
        .from("audios")
        .getPublicUrl(path);

      const publicUrl = urlData?.publicUrl;

      await (supabase as any).from("speaking_recordings").insert({
        student_id: studentId,
        step_id: stepId || null,
        audio_url: publicUrl,
        status: "pending",
        recorded_at: new Date().toISOString(),
      });

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      toast({
        title: "Gravacao enviada! Seu professor vai avaliar em breve.",
      });

      onSent?.();
      handleRerecord();
    } catch {
      toast({
        title: "Erro ao enviar gravacao.",
        variant: "destructive",
      });
      setRecorderState("stopped");
    }
  };

  if (noSupport) {
    return (
      <p className="text-sm text-muted-foreground font-light">
        Seu navegador nao suporta gravacao de audio.
      </p>
    );
  }

  if (permissionError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive font-light">
          Permissao para o microfone foi negada. Permita o acesso ao microfone
          nas configuracoes do navegador e tente novamente.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPermissionError(false)}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Idle state */}
      {recorderState === "idle" && (
        <Button
          className="w-full bg-primary text-primary-foreground font-bold"
          onClick={startRecording}
        >
          <Mic className="h-4 w-4 mr-2" />
          Gravar resposta
        </Button>
      )}

      {/* Recording state */}
      {recorderState === "recording" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-bold text-red-600">
              Gravando... {formatTime(elapsed)}
            </span>
            <span className="text-xs text-muted-foreground font-light ml-auto">
              max {formatTime(MAX_SECONDS)}
            </span>
          </div>
          <Button
            variant="outline"
            className="w-full font-bold border-red-500/40 text-red-600 hover:bg-red-500/10"
            onClick={stopRecording}
          >
            <Square className="h-4 w-4 mr-2 fill-red-500 text-red-500" />
            Parar
          </Button>
        </div>
      )}

      {/* Stopped / preview state */}
      {(recorderState === "stopped" || recorderState === "sending") &&
        audioUrl && (
          <div className="space-y-3">
            <audio controls src={audioUrl} className="w-full h-10" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-sm font-bold"
                onClick={handleRerecord}
                disabled={recorderState === "sending"}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Regravar
              </Button>
              <Button
                className={cn(
                  "flex-1 text-sm font-bold bg-primary text-primary-foreground",
                  recorderState === "sending" && "opacity-70"
                )}
                onClick={handleSend}
                disabled={recorderState === "sending"}
              >
                <Send className="h-4 w-4 mr-1.5" />
                {recorderState === "sending"
                  ? "Enviando..."
                  : "Enviar para o professor"}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
};

export default VoiceRecorder;
