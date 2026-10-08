// أسماء المدارس في قاعدة المعلّمين ← db_schools.json (لـ build_school_map.py)
//     node scripts/fetch_db_schools.mjs
// قراءةٌ فقط عبر واجهة Firestore العامّة (القواعد تسمح بالقراءة حتّى المرحلة ٢). لا يُحفظ إلّا
// اسم المدرسة ونوعها وعدد معلّميها — لا أسماء معلّمين ولا أرقام.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/identity.js', import.meta.url), 'utf8');
const key = (src.match(/apiKey:\s*'([^']+)'/) || [])[1];
const project = (src.match(/projectId:\s*'([^']+)'/) || [])[1];
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/teachers`;
let url = `${base}?pageSize=300&key=${key}`, docs = [];
while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    docs = docs.concat(j.documents || []);
    url = j.nextPageToken ? `${base}?pageSize=300&pageToken=${j.nextPageToken}&key=${key}` : null;
}
const val = f => (f ? (f.stringValue ?? f.integerValue ?? '') : '');
const schools = {};
for (const d of docs) {
    const f = d.fields || {};
    const s = String(val(f['المدرسة'])).trim();
    if (!s) continue;
    schools[s] = schools[s] || { n: 0, type: String(val(f['نوع المدرسة'])).trim() };
    schools[s].n++;
}
fs.writeFileSync('db_schools.json', JSON.stringify(schools, null, 1));
console.log('معلّمون:', docs.length, '| مدارس:', Object.keys(schools).length);
