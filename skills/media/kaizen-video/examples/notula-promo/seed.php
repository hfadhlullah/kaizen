<?php
// Seeds the scratch Notula database (never the real one) with the two sample meetings.
use App\Models\Recording;
use Illuminate\Support\Facades\Storage;
$m = json_decode(file_get_contents(getenv('SEED') . '/meetings.json'), true);
$sum = [
 'standup' => "## Decisions\n- Move the microphone permission screen after the welcome tour.\n- Add a sample recording so the list is never empty.\n\n## Action items\n- **Ava** — ship the onboarding change by Thursday.\n- **Ava** — book three customer calls to test Indonesian summaries; share notes Friday.\n\n## Notes\n- Sign-ups are fine; people drop off before their first recording.",
 'interview' => "## Key points\n- Rina types notes during meetings and misses half of what is said.\n- She rewrites everything afterwards.\n\n## What she needs\n- Decisions and owners, not every word.",
];
$names = ['standup' => ['Speaker 1' => 'Andrew', 'Speaker 2' => 'Ava'], 'interview' => ['Speaker 1' => 'Rina', 'Speaker 2' => 'Ava']];
foreach (['interview', 'standup'] as $k) {
    $r = new Recording();
    $r->forceFill(['user_id' => 1, 'title' => $m[$k]['title'], 'language' => 'en', 'source' => 'recording', 'status' => 'transcribed',
        'audio_path' => 'x', 'mime_type' => 'audio/mp4', 'size_bytes' => filesize(getenv('SEED') . "/$k.m4a"), 'duration_seconds' => $m[$k]['seconds'],
        'segments' => $m[$k]['segments'], 'speakers' => $names[$k], 'summary_status' => 'done', 'summary_template' => 'meeting', 'summary' => $sum[$k]])->save();
    $path = "recordings/{$r->id}/original.m4a";
    Storage::disk('local')->put($path, file_get_contents(getenv('SEED') . "/$k.m4a"));
    $r->forceFill(['audio_path' => $path])->save();
}
echo Recording::count(), "\n";
