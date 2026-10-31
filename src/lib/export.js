import { diffLines, unifiedText } from './diff.js';
import { stripReviewIds } from './html.js';

function versionNumber(session, id) {
  const i = session.versions.findIndex((v) => v.id === id);
  return i < 0 ? null : i + 1;
}

export function exportJSON(session, project) {
  const current = session.versions.find(
    (v) => v.id === session.currentVersionId,
  );
  const byId = new Map(session.versions.map((v) => [v.id, v]));
  let accepted = current;
  while (accepted && !['base', 'kept'].includes(accepted.status))
    accepted = byId.get(accepted.parentId);
  return JSON.stringify(
    {
      app: 'Common Ground',
      format: 'common-ground-session@1',
      exportedAt: new Date().toISOString(),
      voiceMetrics: session.voiceMetrics || [],
      tasks: session.tasks || [],
      project: { id: project.id, name: project.name },
      transcript: session.messages.map((m) => ({
        role:
          m.role === 'assistant'
            ? 'Ground'
            : m.role === 'user'
              ? 'You'
              : 'Note',
        at: new Date(m.at).toISOString(),
        via: m.via,
        taskId: m.taskId,
        lane: m.lane,
        text: m.content,
        scripted: m.scripted || undefined,
        reference: m.ref || undefined,
        pointedAt: m.targets?.length ? m.targets : undefined,
        action: m.action,
        version: m.versionId ? versionNumber(session, m.versionId) : undefined,
      })),
      versions: session.versions.map((v, i) => {
        const parent = v.parentId ? byId.get(v.parentId) : null;
        const d =
          parent && v.html && parent.html
            ? diffLines(stripReviewIds(parent.html), stripReviewIds(v.html))
            : null;
        return {
          number: i + 1,
          id: v.id,
          summary: v.summary,
          status: v.status,
          origin: v.origin,
          createdAt: new Date(v.createdAt).toISOString(),
          parent: parent ? versionNumber(session, parent.id) : null,
          changes: v.changes,
          diff: d
            ? {
                added: d.added,
                removed: d.removed,
                unified:
                  v.status === 'kept' || v.id === session.currentVersionId
                    ? unifiedText(d)
                    : undefined,
              }
            : undefined,
          files: v.sourceChanges?.length
            ? v.sourceChanges.map((f) => ({
                file: f.file,
                unified: unifiedText(
                  diffLines(f.before, f.after),
                  f.file,
                  f.file,
                ),
              }))
            : undefined,
        };
      }),
      currentVersion: versionNumber(session, session.currentVersionId),
      currentSource: current?.html ? stripReviewIds(current.html) : null,
      acceptedSource: accepted?.html ? stripReviewIds(accepted.html) : null,
    },
    null,
    2,
  );
}

export function exportMarkdown(session, project) {
  const lines = [
    `# Common Ground session — ${project.name}`,
    '',
    `Exported ${new Date().toLocaleString()}`,
    '',
  ];
  lines.push('## Conversation', '');
  for (const m of session.messages) {
    const who =
      m.role === 'assistant'
        ? '**Ground**'
        : m.role === 'user'
          ? '**You**'
          : '_Note_';
    const time = new Date(m.at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    let line = `- ${who} (${time}${m.via === 'voice' ? ', voice' : ''}${m.scripted ? ', scripted demo' : ''}): ${m.content.replace(/\n+/g, ' ')}`;
    if (m.ref)
      line += `\n  - Pointing at: \`${m.ref.id}\`${m.ref.label ? ` — ${m.ref.label}` : ''}${m.ref.locked ? ' (locked)' : ''}`;
    if (m.targets?.length)
      line += `\n  - Ground pointed at: ${m.targets.map((t) => `\`${t.id}\`${t.label ? ` (${t.label})` : ''}`).join(', ')}`;
    if (m.versionId)
      line += `\n  - Created version v${versionNumber(session, m.versionId)}`;
    lines.push(line);
  }
  lines.push('', '## Versions', '');
  const byId = new Map(session.versions.map((v) => [v.id, v]));
  session.versions.forEach((v, i) => {
    const current = v.id === session.currentVersionId ? ' ← current' : '';
    lines.push(`### v${i + 1} · ${v.summary} (${v.status})${current}`, '');
    if (v.changes?.length)
      lines.push(
        ...v.changes.map(
          (c) => `- ${c.description}${c.id ? ` (\`${c.id}\`)` : ''}`,
        ),
        '',
      );
    const parent = v.parentId ? byId.get(v.parentId) : null;
    if (parent?.html && v.html && v.status !== 'undone') {
      lines.push(
        '```diff',
        unifiedText(
          diffLines(stripReviewIds(parent.html), stripReviewIds(v.html)),
        ),
        '```',
        '',
      );
    }
    for (const f of v.sourceChanges || [])
      lines.push(
        `File \`${f.file}\``,
        '```diff',
        unifiedText(diffLines(f.before, f.after), f.file, f.file),
        '```',
        '',
      );
  });
  return lines.join('\n');
}
