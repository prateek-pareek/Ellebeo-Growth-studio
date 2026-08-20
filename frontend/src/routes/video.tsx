import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Sparkles, Clapperboard, Wand2, Images, Video as VideoIcon } from "lucide-react";
import {
  useVideoPlans,
  updateVideoPlan,
  approveVideoPlan,
  type VideoPlanRow,
  type VideoScene,
} from "@/lib/providers/video-provider";

export const Route = createFileRoute("/video")({
  head: () => ({
    meta: [
      { title: "Video — Elle.Be.O Growth" },
      { name: "description", content: "Review, tweak, and approve AI-drafted short-form video before it renders." },
    ],
  }),
  component: VideoPage,
});

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_review", label: "Needs Review" },
  { id: "edited", label: "Edited" },
  { id: "rendering", label: "Rendering" },
  { id: "rendered", label: "Rendered" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

const VIDEO_TYPE_ICON = { slideshow: Images, reels: Clapperboard, ai_clips: Wand2 } as const;

function VideoPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<VideoPlanRow | null>(null);
  const { items, loading, isEmpty, error, refresh } = useVideoPlans(statusFilter === "all" ? undefined : statusFilter);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
          Growth Studio
        </p>
        <h1 className="font-serif text-2xl leading-tight">Video</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`text-[10px] font-semibold uppercase tracking-widest rounded-full px-3.5 py-2 transition-colors ${
              statusFilter === f.id ? "bg-foreground text-offwhite" : "bg-muted text-foreground hover:bg-muted/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading, failure and "nothing here" are mutually exclusive. They used
          to render independently, so a failed request showed "Couldn't load
          video plans." and "No videos here yet." at the same time — the second
          message flatly contradicting the first. */}
      {loading ? (
        <p className="text-sm text-taupe">Loading…</p>
      ) : error ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl bg-muted/20 py-14 text-center gap-3">
          <p className="text-sm text-destructive">Couldn't load video plans.</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="text-sm underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl bg-muted/20 py-14 text-center">
          <p className="text-sm text-taupe">No videos here yet.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((row) => (
          <VideoCard key={row.id} row={row} onClick={() => setEditing(row)} />
        ))}
      </div>

      {editing && (
        <VideoEditor
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(updated);
            refresh();
          }}
          onApproved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VideoCard({ row, onClick }: { row: VideoPlanRow; onClick: () => void }) {
  const Icon = VIDEO_TYPE_ICON[row.videoType as keyof typeof VIDEO_TYPE_ICON] ?? VideoIcon;
  const thumbnail = row.plan.scenes[0]?.asset.url;

  return (
    <article
      onClick={onClick}
      className="cursor-pointer bg-card rounded-2xl shadow-elevated overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="aspect-[9/16] bg-muted flex items-center justify-center overflow-hidden">
        {row.outputUrl ? (
          <video src={row.outputUrl} muted className="w-full h-full object-cover" />
        ) : thumbnail ? (
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-8 h-8 text-taupe" />
        )}
      </div>
      <div className="p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-taupe">
            <Icon className="w-3 h-3" />
            {row.videoType}
          </span>
          <StatusPill status={row.status} />
        </div>
        {row.criticScore !== null && (
          <p className="text-[10px] text-taupe">
            Critic {Math.round(row.criticScore * 100)}%{row.criticRevisions > 0 ? ` · ${row.criticRevisions} revision${row.criticRevisions > 1 ? "s" : ""}` : ""}
          </p>
        )}
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-card text-foreground",
    in_review: "bg-brass/15 text-brass-ink",
    edited: "bg-muted text-foreground",
    rendering: "bg-foreground text-offwhite",
    rendered: "bg-sage text-offwhite",
    published: "bg-sage text-offwhite",
    failed: "bg-destructive text-offwhite",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[9px] uppercase tracking-[0.18em] shadow-sm ${styles[status] || styles.draft}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function VideoEditor({
  row,
  onClose,
  onSaved,
  onApproved,
}: {
  row: VideoPlanRow;
  onClose: () => void;
  onSaved: (updated: VideoPlanRow) => void;
  onApproved: () => void;
}) {
  const [scenes, setScenes] = useState<VideoScene[]>(row.plan.scenes);
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(row.plan.audio.voiceover.enabled);
  const [musicMood, setMusicMood] = useState(row.plan.audio.music.mood ?? "");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const locked = row.status === "rendering" || row.status === "rendered" || row.status === "published";

  const moveScene = (from: number, direction: -1 | 1) => {
    const to = from + direction;
    if (to < 0 || to >= scenes.length) return;
    const next = [...scenes];
    [next[from], next[to]] = [next[to]!, next[from]!];
    setScenes(next);
  };

  const updateSceneField = (index: number, field: "headline" | "caption" | "url", value: string) => {
    setScenes((prev) =>
      prev.map((s) =>
        s.index === index
          ? field === "url"
            ? { ...s, asset: { ...s.asset, url: value } }
            : { ...s, text: { ...s.text, [field]: value } }
          : s,
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateVideoPlan(row.id, {
        sceneOrder: scenes.map((s) => s.index),
        scenes: scenes.map((s) => ({ index: s.index, headline: s.text.headline, caption: s.text.caption, assetUrl: s.asset.url ?? undefined })),
        voiceoverEnabled,
        musicMood: musicMood || null,
      });
      toast.success("Saved");
      onSaved(updated);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveVideoPlan(row.id);
      toast.success("Approved — rendering now");
      onApproved();
    } catch {
      toast.error("Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-card z-50 flex flex-col shadow-2xl">
        <div className="bg-card flex items-start justify-between gap-4 px-6 py-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
              Edit video · {row.videoType}
            </p>
            <StatusPill status={row.status} />
          </div>
          <button onClick={onClose} className="shrink-0 text-taupe hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {row.outputUrl && (
            <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-80 mx-auto">
              <video src={row.outputUrl} controls className="w-full h-full object-contain" />
            </div>
          )}

          {row.errorMessage && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{row.errorMessage}</p>
          )}

          <section>
            <p className="text-[9px] uppercase tracking-widest text-taupe mb-3">Scenes</p>
            <div className="space-y-3">
              {scenes.map((scene, i) => (
                <div key={scene.index} className="rounded-xl bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest text-taupe">
                      Scene {i + 1} · {scene.durationSeconds}s
                    </span>
                    <div className="flex gap-1">
                      <button disabled={locked || i === 0} onClick={() => moveScene(i, -1)} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button disabled={locked || i === scenes.length - 1} onClick={() => moveScene(i, 1)} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    disabled={locked}
                    value={scene.text.headline ?? ""}
                    onChange={(e) => updateSceneField(scene.index, "headline", e.target.value)}
                    placeholder="Headline"
                    className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 disabled:opacity-60"
                  />
                  <input
                    disabled={locked}
                    value={scene.text.caption ?? ""}
                    onChange={(e) => updateSceneField(scene.index, "caption", e.target.value)}
                    placeholder="Caption (optional)"
                    className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 disabled:opacity-60"
                  />
                  <input
                    disabled={locked}
                    value={scene.asset.url ?? ""}
                    onChange={(e) => updateSceneField(scene.index, "url", e.target.value)}
                    placeholder="Asset URL"
                    className="w-full text-xs bg-card border border-border rounded-lg px-3 py-2 disabled:opacity-60 text-taupe"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[9px] uppercase tracking-widest text-taupe">Audio</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={locked}
                checked={voiceoverEnabled}
                onChange={(e) => setVoiceoverEnabled(e.target.checked)}
              />
              Voiceover enabled
            </label>
            <input
              disabled={locked}
              value={musicMood}
              onChange={(e) => setMusicMood(e.target.value)}
              placeholder="Music mood (e.g. elegant, upbeat, chill)"
              className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2 disabled:opacity-60"
            />
          </section>

          <section>
            <p className="text-[9px] uppercase tracking-widest text-taupe mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Agent timeline
            </p>
            {row.plan.critic.score !== null && (
              <p className="text-xs text-foreground mb-2">
                Critic score {Math.round(row.plan.critic.score * 100)}% · {row.plan.critic.passed ? "passed" : "not passed"}
                {row.plan.critic.revisions > 0 ? ` · ${row.plan.critic.revisions} revision${row.plan.critic.revisions > 1 ? "s" : ""}` : ""}
              </p>
            )}
            {row.plan.critic.notes.length > 0 ? (
              <ul className="space-y-1.5">
                {row.plan.critic.notes.map((note, i) => (
                  <li key={i} className="text-xs text-taupe bg-muted/30 rounded-lg px-3 py-2">
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-taupe">No agent notes yet.</p>
            )}
          </section>
        </div>

        <div className="border-t border-border px-6 py-4 flex gap-3">
          <button
            disabled={locked || saving}
            onClick={handleSave}
            className="flex-1 text-sm font-semibold rounded-full px-4 py-2.5 bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save edits"}
          </button>
          <button
            disabled={locked || approving}
            onClick={handleApprove}
            className="flex-1 text-sm font-semibold rounded-full px-4 py-2.5 bg-foreground text-offwhite hover:bg-foreground/90 disabled:opacity-50"
          >
            {approving ? "Approving…" : "Approve & render"}
          </button>
        </div>
      </div>
    </>
  );
}
