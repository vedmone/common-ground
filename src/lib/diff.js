// Line diff (Myers O(ND) on the trimmed middle) and unified-hunk grouping for the source drawer.

function myers(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, offset, d);
    }
    if (d > 4000) return null;
  }
  return null;
}

function backtrack(trace, a, b, offset, dFinal) {
  const ops = [];
  let x = a.length;
  let y = b.length;
  for (let d = dFinal; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = v[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ t: '=', a: x - 1, b: y - 1 });
      x--;
      y--;
    }
    if (x === prevX) ops.push({ t: '+', b: y - 1 });
    else ops.push({ t: '-', a: x - 1 });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push({ t: '=', a: x - 1, b: y - 1 });
    x--;
    y--;
  }
  return ops.reverse();
}

export function diffLines(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  let mid = midA.length * midB.length === 0 && midA.length + midB.length < 1 ? [] : myers(midA, midB);
  if (!mid) mid = [...midA.map((_, i) => ({ t: '-', a: i })), ...midB.map((_, i) => ({ t: '+', b: i }))];
  const lines = [];
  for (let i = 0; i < start; i++) lines.push({ type: 'same', text: a[i], aNo: i + 1, bNo: i + 1 });
  for (const op of mid) {
    if (op.t === '=') lines.push({ type: 'same', text: midA[op.a], aNo: start + op.a + 1, bNo: start + op.b + 1 });
    else if (op.t === '-') lines.push({ type: 'del', text: midA[op.a], aNo: start + op.a + 1 });
    else lines.push({ type: 'add', text: midB[op.b], bNo: start + op.b + 1 });
  }
  for (let i = endA, j = endB; i < a.length; i++, j++) lines.push({ type: 'same', text: a[i], aNo: i + 1, bNo: j + 1 });
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === 'add') added++;
    else if (l.type === 'del') removed++;
  }
  return { lines, added, removed };
}

export function hunks(diff, context = 3) {
  const { lines } = diff;
  const keep = new Uint8Array(lines.length);
  lines.forEach((l, i) => {
    if (l.type !== 'same') for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = 1;
  });
  const out = [];
  let current = null;
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (!current) {
        current = { skippedBefore: skipped, lines: [] };
        out.push(current);
      }
      current.lines.push(l);
      skipped = 0;
    } else {
      current = null;
      skipped++;
    }
  });
  return { hunks: out, trailing: skipped };
}

export function unifiedText(diff, nameA = 'before.html', nameB = 'after.html') {
  const { hunks: hs } = hunks(diff);
  const parts = [`--- ${nameA}`, `+++ ${nameB}`];
  for (const h of hs) {
    const first = h.lines[0];
    parts.push(`@@ -${first.aNo ?? first.bNo} +${first.bNo ?? first.aNo} @@`);
    for (const l of h.lines) parts.push(`${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}${l.text}`);
  }
  return parts.join('\n');
}
