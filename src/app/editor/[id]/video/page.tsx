"use client";

import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { VideoEditor, type VideoEditorProject } from "@/components/video/VideoEditor";
import type { TimelineThumbnail, VideoCutRange } from "@/components/video/VideoTimeline";
import type { AspectRatio } from "@/components/video/AspectRatioToggle";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function VideoEditorPage({ params }: PageProps) {
  const { id } = use(params);

  const [project, setProject] = useState<VideoEditorProject | null>(null);
  const [thumbnails, setThumbnails] = useState<TimelineThumbnail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("Falha ao carregar o projeto");
        const data = await res.json();
        const p = data.project;
        if (cancelled) return;
        setProject({
          id: p.id,
          title: p.title,
          videoUrl: p.videoUrl ?? p.exportedVideoUrl ?? null,
          thumbnailUrl: p.thumbnailUrl ?? null,
          videoDuration: p.videoDuration ?? p.originalDuration ?? null,
          aspectRatio: (p.aspectRatio as AspectRatio | null) ?? "16:9",
          cutRanges: (p.cutRanges as VideoCutRange[] | null) ?? [],
        });
        setDownloadUrl(p.exportedVideoUrl ?? null);

        // Thumbnails are generated lazily; failure here is non-fatal.
        try {
          const tRes = await fetch(`/api/video/${id}/thumbnails`);
          if (tRes.ok) {
            const tData = await tRes.json();
            if (!cancelled && Array.isArray(tData.thumbnails)) {
              setThumbnails(tData.thumbnails);
            }
          }
        } catch {
          /* thumbnails optional */
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSaveCuts = useCallback(
    async (cutRanges: VideoCutRange[], aspectRatio: AspectRatio) => {
      try {
        await fetch(`/api/video/${id}/cuts`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cutRanges, aspectRatio }),
        });
      } catch {
        toast.error("Não foi possível salvar os cortes");
      }
    },
    [id]
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/video/${id}/render`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Falha ao exportar o vídeo");
        return;
      }
      setDownloadUrl(data.downloadUrl);
      toast.success("Vídeo exportado!", {
        description: "Seu corte está pronto para download.",
      });
    } catch {
      toast.error("Falha ao exportar o vídeo");
    } finally {
      setIsExporting(false);
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">
        Carregando vídeo...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-red-400">
        {error || "Projeto não encontrado"}
      </div>
    );
  }

  return (
    <VideoEditor
      project={project}
      thumbnails={thumbnails}
      onSaveCuts={handleSaveCuts}
      onExport={handleExport}
      isExporting={isExporting}
      downloadUrl={downloadUrl}
    />
  );
}
