"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Mic,
  Square,
  Play,
  Pause,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";
import type { Segment } from "@/lib/db/schema";

interface RerecordModalProps {
  isOpen: boolean;
  segment: Segment | null;
  onClose: () => void;
  onConfirm: (segmentId: string, audioBlob: Blob) => Promise<void>;
}

type RecordingState = "idle" | "recording" | "recorded" | "playing";

export function RerecordModal({
  isOpen,
  segment,
  onClose,
  onConfirm,
}: RerecordModalProps) {
  const [recordingState, setRecordingState] =
    useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Get error details based on error type
  const getErrorInfo = () => {
    if (!segment) return null;

    const analysis = segment.analysis as any;

    if (segment.errorType === "factual_error" && analysis?.factualErrorDetail) {
      return {
        type: "Erro Factual",
        detail: analysis.factualErrorDetail,
        suggestion: analysis.rerecordSuggestion || "Corrija o erro factual e regrave este segmento.",
      };
    }

    if (
      segment.errorType === "contradiction" &&
      analysis?.contradictionDetail
    ) {
      return {
        type: "Contradição",
        detail: analysis.contradictionDetail,
        suggestion: analysis.rerecordSuggestion || "Resolva a contradição e regrave este segmento.",
      };
    }

    if (segment.errorType === "confusing" && analysis?.confusingDetail) {
      return {
        type: "Confuso",
        detail: analysis.confusingDetail,
        suggestion: analysis.rerecordSuggestion || "Esclareça o conteúdo e regrave este segmento.",
      };
    }

    if (segment.errorType === "incomplete" && analysis?.incompleteDetail) {
      return {
        type: "Incompleto",
        detail: analysis.incompleteDetail,
        suggestion: analysis.rerecordSuggestion || "Complete o raciocínio e regrave este segmento.",
      };
    }

    return {
      type: "Precisa Regravar",
      detail: segment.errorDetail || "Este segmento precisa ser regravado.",
      suggestion: analysis?.rerecordSuggestion || "Regrave este segmento com as melhorias sugeridas.",
    };
  };

  const errorInfo = getErrorInfo();

  // Cleanup function
  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  // Draw waveform visualization
  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (recordingState !== "recording") return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = "rgb(17, 24, 39)"; // bg-gray-900
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "rgb(59, 130, 246)"; // blue-500
      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Setup Web Audio API for visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;

      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecordingState("recorded");

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecordingState("recording");
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start waveform visualization
      drawWaveform();
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Não foi possível acessar o microfone. Conceda a permissão e tente novamente.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.stop();

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    }
  };

  // Play/pause recorded audio
  const togglePlayback = () => {
    if (!audioElementRef.current || !audioUrl) return;

    if (recordingState === "playing") {
      audioElementRef.current.pause();
      setRecordingState("recorded");
    } else {
      audioElementRef.current.play();
      setRecordingState("playing");
    }
  };

  // Reset recording
  const resetRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingState("idle");
    setRecordingTime(0);
  };

  // Confirm and upload
  const handleConfirm = async () => {
    if (!segment || !audioBlob) return;

    setIsSubmitting(true);
    try {
      await onConfirm(segment.id, audioBlob);
      handleClose();
    } catch (error) {
      console.error("Error confirming re-record:", error);
      alert("Não foi possível salvar a gravação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    cleanup();
    resetRecording();
    onClose();
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen || !segment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 m-4 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Regravar Segmento
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Grave uma nova versão deste segmento para corrigir o problema
          </p>
        </div>

        {/* Original text */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Texto Original
          </h3>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {segment.text}
            </p>
          </div>
        </div>

        {/* Error information */}
        {errorInfo && (
          <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="destructive">{errorInfo.type}</Badge>
                </div>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                  <strong>Problema:</strong> {errorInfo.detail}
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Sugestão:</strong> {errorInfo.suggestion}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recording area */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Gravar Novo Áudio
          </h3>

          {/* Waveform visualization */}
          <div className="bg-gray-900 rounded-md mb-4 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={600}
              height={100}
              className="w-full h-24"
            />
          </div>

          {/* Timer */}
          <div className="text-center mb-4">
            <div className="text-3xl font-mono font-bold text-gray-900 dark:text-white">
              {formatTime(recordingTime)}
            </div>
            {recordingState === "recording" && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Gravando...
                </span>
              </div>
            )}
          </div>

          {/* Recording controls */}
          <div className="flex items-center justify-center gap-3">
            {recordingState === "idle" && (
              <Button
                onClick={startRecording}
                className="flex items-center gap-2"
              >
                <Mic className="w-4 h-4" />
                Iniciar Gravação
              </Button>
            )}

            {recordingState === "recording" && (
              <Button
                onClick={stopRecording}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Square className="w-4 h-4" />
                Parar Gravação
              </Button>
            )}

            {(recordingState === "recorded" || recordingState === "playing") && (
              <>
                <Button
                  onClick={togglePlayback}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {recordingState === "playing" ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Play
                    </>
                  )}
                </Button>

                <Button
                  onClick={resetRecording}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Gravar Novamente
                </Button>
              </>
            )}
          </div>

          {/* Hidden audio element for playback */}
          {audioUrl && (
            <audio
              ref={audioElementRef}
              src={audioUrl}
              onEnded={() => setRecordingState("recorded")}
              className="hidden"
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={recordingState !== "recorded" || isSubmitting}
            className="flex items-center gap-2"
          >
            {isSubmitting ? (
              "Salvando..."
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirmar e Substituir
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
