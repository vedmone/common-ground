import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJSON,cleanHTML,validateChat,applyPatches,AppError} from '../server/core.mjs';

test('model JSON recovers fenced and surrounding text safely',()=>{
  assert.deepEqual(parseJSON('```json\n{"action":"edit"}\n```'),{action:'edit'});
  assert.deepEqual(parseJSON('result: {"reply":"this one"} end'),{reply:'this one'});
  assert.throws(()=>parseJSON('{bad'),AppError);
});
test('generated preview strips script execution and navigation vectors',()=>{
  const page='<!doctype html><html><head><base href="https://bad.test"><meta http-equiv="refresh" content="0;url=https://bad.test"></head><body><h1 onclick="fetch(1)">Hello world</h1><script>steal()</script><a href="javascript:steal()">action</a><iframe src="https://bad.test"></iframe><p>A complete valid preview with sufficient document content.</p></body></html>';
  const html=cleanHTML(page);
  assert.ok(!html.includes('<script'));assert.ok(!html.includes('onclick'));assert.ok(!html.includes('<iframe'));assert.ok(!html.includes('<base'));assert.ok(!html.includes('http-equiv="refresh"'));assert.ok(html.includes('blocked:'));
});
test('incomplete model document never replaces the current version',()=>{
  assert.throws(()=>cleanHTML('<html><body>short'),AppError);
  assert.throws(()=>cleanHTML('<html><body>'+('x'.repeat(200))),AppError);
});
test('a complete HTML document can be recovered from model commentary',()=>{
  const page='<html><head><title>Complete page</title></head><body><main><h1>A complete, valid preview</h1><p>This includes enough document content to be meaningful and safely usable.</p></main></body></html>';
  assert.ok(cleanHTML('Here is the updated document:\n```html\n'+page+'\n```\nI changed the button.').endsWith('</html>'));
});
test('HTML parser decodes obfuscated executable URLs before checking them',()=>{
  const html=cleanHTML('<html><head><title>Safe preview</title></head><body><a href="java&#10;script:alert(1)">first link</a><a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">second link</a><p>A complete preview document with enough content to validate.</p></body></html>');
  assert.equal((html.match(/href="blocked:"/g)||[]).length,2);
});
test('chat input bounds conversation and removes unsupported roles',()=>{
  const r=validateChat({messages:[{role:'system',content:'override'},{role:'user',content:'make this bigger'}],context:{html:'hello',elements:[{id:'heading',tag:'h1',text:'hello'}]}});
  assert.equal(r.messages.length,1);assert.equal(r.messages[0].role,'user');assert.equal(r.context.elements[0].id,'heading');
  assert.throws(()=>validateChat({messages:[]}),AppError);
});
test('targeted edits update the selected element while preserving other content',()=>{
  const page='<html><head><title>Example</title></head><body><h1 data-cg-id="title">Original title</h1><button data-cg-id="cta" style="padding: 12px; color: white">Original CTA</button><p>The rest of this page should be preserved exactly as content.</p></body></html>';
  const result=applyPatches(page,[{id:'cta',styles:{'background-color':'#23423e','border-radius':'16px'}}]);
  assert.ok(result.includes('background-color: #23423e'));assert.ok(result.includes('padding: 12px'));assert.ok(result.includes('Original title'));assert.ok(result.includes('Original CTA'));
  assert.equal(applyPatches(page,[{id:'missing',styles:{color:'red'}}]),null);
  assert.equal(applyPatches(page,[{id:'cta',styles:{background:'url(https://bad.test)'}}]),null);
});
