// =========================================================================
// المراسلات — الشاشة (منذ 2026-10-12)
//
// قالبٌ ← نموذجٌ ← معاينةٌ حيّة. المخاطَبون من مدارس قاعدة المعلّمين، و«الكشف المرفق» من معلّميها،
// والإخراج: نسخ النصّ، Word، و«نسخ وفتح نظام المراسلات» (dms.moe.gov.om — لا ربط آليّ بعد، النصّ في الحافظة).
// المسوّدة في svf_letters_draft، وسجلّ ما أُخرج في svf_letters_log (آخر ٥٠).
// المحرّك النقيّ في letters-core.js (SvfLetters).
// =========================================================================
(function (root) {
    'use strict';

    const DMS_URL = 'https://dms.moe.gov.om';
    const DRAFT_KEY = 'svf_letters_draft', LOG_KEY = 'svf_letters_log';
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : String(s == null ? '' : s));
    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
    const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const ID = () => root.SupervisorIdentity;
    const norm = s => (ID() && ID().normalize ? ID().normalize(s) : clean(s));
    const tKey = t => clean(t.name) + '|' + clean(t.school);

    let S = null;   // الحالة: { tpl, fields: {tplId: {...}}, schools[], female, picked: {key: false} }

    function loadState() {
        const d = readJSON(DRAFT_KEY, null);
        S = Object.assign({ tpl: 'exchange', fields: {}, schools: [], female: false, picked: {} }, d || {});
        delete S.title; delete S.signer;   // مسوّداتٌ قديمةٌ حملت التوقيع
    }
    const saveState = () => writeJSON(DRAFT_KEY, S);

    const tpl = () => SvfLetters.templateOf(S.tpl);
    function fieldsOf(t) {
        const cur = S.fields[t.id] || (S.fields[t.id] = {});
        t.fields.forEach(f => {
            if (f.id in cur) return;
            // ما يُشارك قالباً آخر (from) يُؤخذ منه أوّل مرّة: شهادات الشكر من خطاب التبادل
            const src = f.from && S.fields[f.from] && S.fields[f.from][f.id];
            cur[f.id] = clean(src) ? src : (f.value == null ? '' : f.value);
        });
        return cur;
    }

    // معلّمو المدارس المخاطَبة، والمستثنى منهم بيد المشرف خارج الكشف
    function rosterAll() {
        if (!ID()) return [];
        const out = [], seen = new Set();
        S.schools.forEach(s => (ID().teachersOfSchool(s) || []).forEach(t => {
            const k = tKey(t);
            if (!seen.has(k)) { seen.add(k); out.push(t); }
        }));
        return out;
    }
    // ومعهم من أُضيف بيده: من مشرفين آخرين أو يدويّاً (S.extra — يُحفظ في المسوّدة والسجلّ لأنّه جزء الخطاب)
    function rosterFull() {
        const out = rosterAll(), seen = new Set(out.map(tKey));
        (S.extra || []).forEach(t => { const k = tKey(t); if (!seen.has(k)) { seen.add(k); out.push(Object.assign({ extra: true }, t)); } });
        return out;
    }
    const roster = () => rosterFull().filter(t => S.picked[tKey(t)] !== false);

    // ── مدارس المشرفين الآخرين (طلب المشرف 2026-10-13: «الإضافة باسم المدرسة») ──
    // القاعدة كلّها تُجلب مرّةً حين يظهر قسم الكشف، وفي الذاكرة وحدها؛ المدرسة المختارة يُضاف كلّ معلّميها ويُلغى من لا يشمله.
    let allList = null, allState = '';   // '' لم يُطلب · loading · ok · error
    async function loadAll() {
        if (allState === 'loading' || allState === 'ok' || !ID() || !ID().allTeachers) return;
        allState = 'loading'; paintOthers();
        try { allList = await ID().allTeachers(); allState = 'ok'; }
        catch (e) { allList = null; allState = 'error'; }
        paintOthers();
    }
    // المدارس في القاعدة كلّها عدا مدارسي (هي في خانة المدارس أعلاه)، مع مشرفها وعدد معلّميها
    function otherSchools() {
        const mine = new Set((ID() && ID().schoolNames ? ID().schoolNames() : []).map(norm));
        const map = new Map();
        (allList || []).forEach(t => {
            const k = norm(t.school);
            if (!k || mine.has(k)) return;
            const e = map.get(k) || { school: clean(t.school), sups: new Set(), n: 0 };
            e.n++; if (t.supervisor) e.sups.add(t.supervisor);
            map.set(k, e);
        });
        return [...map.values()].sort((a, b) => a.school.localeCompare(b.school, 'ar'));
    }
    function paintOthers() {
        const st = document.getElementById('lettersOthersState'), dl = document.getElementById('lettersOtherSchools');
        if (!st || !dl) return;
        if (allState === 'ok') {
            const list = otherSchools();
            dl.innerHTML = list.map(e => `<option value="${esc(e.school)}">${esc([...e.sups].join('، ') + ' · ' + e.n + ' معلّم')}</option>`).join('');
            st.textContent = list.length + ' مدرسة لمشرفين آخرين — اكتب جزءاً من اسمها واختر';
        } else st.textContent = allState === 'loading' ? 'جاري تحميل مدارس المشرفين الآخرين…'
            : allState === 'error' ? 'تعذّر تحميل مدارس المشرفين الآخرين — تحقّق من الاتصال، أو أضف المعلّم يدويّاً' : '';
    }
    function addSchoolTeachers(v) {
        const k = norm(v);
        const list = (allList || []).filter(t => norm(t.school) === k);
        if (!list.length) { toast(allState === 'ok' ? 'اختر المدرسة من القائمة المقترحة' : 'القائمة لم تُحمَّل بعد', 'error'); return false; }
        S.extra = S.extra || [];
        const have = new Set(rosterFull().map(tKey));
        let n = 0;
        list.forEach(t => {
            const x = { name: clean(t.name), school: clean(t.school), fileNumber: clean(t.fileNumber),
                gender: t.gender === 'f' ? 'f' : t.gender === 'm' ? 'm' : '', supervisor: clean(t.supervisor) };
            if (have.has(tKey(x))) return;
            have.add(tKey(x)); S.extra.push(x); delete S.picked[tKey(x)]; n++;
        });
        saveState(); render();
        toast(n ? 'أُضيف ' + n + ' من معلّمي ' + clean(list[0].school) + ' — ألغِ تحديد من لا يشمله الكشف' : 'معلّمو هذه المدرسة في الكشف أصلاً');
        return true;
    }
    function addExtra(t) {
        if (!t || !clean(t.name)) return false;
        const x = { name: clean(t.name), school: clean(t.school), fileNumber: clean(t.fileNumber),
            gender: t.gender === 'f' ? 'f' : t.gender === 'm' ? 'm' : '', supervisor: clean(t.supervisor) };
        S.extra = S.extra || [];
        if (rosterFull().some(y => tKey(y) === tKey(x))) { toast('موجودٌ في الكشف'); return false; }
        S.extra.push(x); delete S.picked[tKey(x)];
        saveState(); render(); return true;
    }

    function letter() {
        const t = tpl();
        return SvfLetters.buildLetter(t.id, fieldsOf(t), {
            schools: S.schools, teachers: t.attach ? roster() : [], femalePrincipal: S.female
        });
    }

    // ── مصادر التعبئة: آخر زيارةٍ مدرسيّة، والتوصيات المتأخّرة ──
    function schoolReports() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !(k.startsWith('supervision_v6_school_report_') || k.startsWith('school_report_'))) continue;
            try { const d = JSON.parse(localStorage.getItem(k)); if (d && d.schoolName && !d.deleted) out.push({ key: k, data: d }); } catch (e) {}
        }
        return out;
    }
    function lastVisitOf(school) {
        const n = norm(school);
        return schoolReports().filter(r => norm(r.data.schoolName) === n)
            .sort((a, b) => String(b.data.visitDate).localeCompare(String(a.data.visitDate)))[0] || null;
    }
    // بنود التوصيات بلا «نوصي…:» ولا الخاتمة
    function recItems(d) {
        if (Array.isArray(d.recs) && d.recs.some(x => x && clean(x.text))) return d.recs.map(x => clean(x && x.text)).filter(Boolean);
        return String(d.recommendations || '').split('\n').map(clean)
            .filter(l => l && !/^و?نوصي/.test(l) && !/^والله الموفق/.test(l)).map(l => l.replace(/^[-–•]\s*/, ''));
    }
    function fillFromVisit() {
        const t = tpl(), f = fieldsOf(t);
        const school = t.noRecipients ? f.school : S.schools[0];
        if (!clean(school)) { toast('اختر المدرسة أولاً', 'error'); return; }
        if (t.id === 'followup' && typeof root.svfRecsBoard === 'function') {
            const today = new Date(); const day = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            const b = root.svfRecsBoard(schoolReports(), day, ID() && ID().normalize);
            const mine = b.overdue.concat(b.soon).filter(x => norm(x.school) === norm(school));
            if (mine.length) {
                f.items = mine.map(x => x.text).join('\n'); f.visitDate = mine[0].visitDate;
                saveState(); render(); toast('أُدرجت ' + mine.length + ' توصيةً حان موعدها'); return;
            }
        }
        const r = lastVisitOf(school);
        if (!r) { toast('لا زيارة محفوظة لهذه المدرسة', 'error'); return; }
        const items = recItems(r.data);
        if (!items.length) { toast('آخر زيارةٍ بلا توصيات', 'error'); return; }
        f.items = items.join('\n');
        if ('visitDate' in f) f.visitDate = r.data.visitDate || f.visitDate;
        saveState(); render(); toast('من زيارة ' + (r.data.visitDate || ''));
    }

    // المعلّم من القاعدة ← رقم الملف والجنس، ومدرسته هي المخاطَبة (لا يُطمس رقمٌ كتبه المشرف لمعلّمٍ آخر: يُستبدل بمعلّمه)
    function fillTeacher(name) {
        const hit = ID() && ID().findTeacher ? ID().findTeacher(name) : null;
        const t = hit && hit.teacher;
        if (!t) return;
        const f = fieldsOf(tpl());
        f.teacher = t.name;
        if (t.fileNumber) f.fileNumber = t.fileNumber;
        if (t.gender === 'f' || t.gender === 'm') f.female = t.gender === 'f';
        if (clean(t.school)) S.schools = [t.school];
        saveState(); render();
    }

    const toast = (m, k) => { if (typeof root.showToast === 'function') root.showToast(m, k); };

    // ── الرسم ──
    function fieldHTML(t, f, v) {
        const id = 'lf_' + f.id, lab = `<label for="${id}" class="block text-xs font-bold text-slate-500 mb-1">${esc(f.label)}</label>`;
        const cls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-indigo-400 outline-none';
        if (f.type === 'check') return `<label class="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" id="${id}" data-f="${f.id}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
        if (f.type === 'textarea') {
            const btn = (f.fromLastVisit || f.fromOverdue) ? `<button type="button" id="lettersFillBtn" class="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-2 py-1 font-bold mr-2">${f.fromOverdue ? 'من التوصيات المتأخّرة' : 'من آخر زيارة'}</button>` : '';
            return `<div><div class="flex items-center justify-between">${lab}${btn}</div><textarea id="${id}" data-f="${f.id}" rows="5" class="${cls}">${esc(v)}</textarea></div>`;
        }
        return `<div>${lab}<input id="${id}" data-f="${f.id}" type="${f.type || 'text'}" value="${esc(v)}" ${f.list ? `list="${f.list === 'teachers' ? 'lettersTeachers' : 'lettersSchools'}"` : ''} class="${cls}"></div>`;
    }

    function render() {
        const box = document.getElementById('lettersApp');
        if (!box || !root.SvfLetters) return;
        const t = tpl(), f = fieldsOf(t);
        const linked = !!(ID() && ID().getTeachers && ID().getTeachers().length);

        box.querySelector('#lettersTpls').innerHTML = SvfLetters.TEMPLATES.map(x => `<button type="button" data-tpl="${x.id}"
            class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${x.id === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}">
            <i class="fa-solid ${x.icon}"></i>${esc(x.label)}</button>`).join('');

        box.querySelector('#lettersSchools').innerHTML = (ID() && ID().schoolNames ? ID().schoolNames() : []).map(s => `<option value="${esc(s)}">`).join('');
        box.querySelector('#lettersTeachers').innerHTML = (t.fields.some(x => x.list === 'teachers') && ID() && ID().teacherNames ? ID().teacherNames() : [])
            .map(s => `<option value="${esc(s)}">`).join('');

        // المخاطَبون
        const rec = box.querySelector('#lettersRecipients');
        rec.classList.toggle('hidden', !!t.noRecipients);
        if (t.oneSchool && S.schools.length > 1) S.schools = S.schools.slice(0, 1);
        box.querySelector('#lettersSchoolChips').innerHTML = S.schools.map((s, i) => `<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-xs font-bold">
            ${esc(s)}<button type="button" data-rm="${i}" class="text-slate-400 hover:text-red-600" aria-label="إزالة">&times;</button></span>`).join('')
            || '<span class="text-xs text-slate-400">بلا مدرسة: «الأفاضل/ مديرو المدارس المعنية»</span>';
        box.querySelector('#lettersFemale').checked = !!S.female;
        box.querySelector('#lettersFemaleWrap').classList.toggle('hidden', S.schools.length !== 1 || !!t.rosterOnly);
        box.querySelector('#lettersRecTitle').textContent = t.rosterOnly ? 'مدارس الفئة المستهدفة' : 'المخاطَبون';
        box.querySelector('#lettersAddHint').textContent = t.rosterOnly ? 'للكشف المرفق وحده — المخاطَب في «بيانات المراسلة»'
            : t.oneSchool ? 'مدرسةٌ واحدة لهذا القالب' : 'مدرسةٌ واحدة ← «الفاضل/ مدير مدرسة…»، وأكثر ← «الأفاضل/ مديرو المدارس المعنية»';

        // الكشف المرفق
        const att = box.querySelector('#lettersAttach');
        att.classList.toggle('hidden', !t.attach);
        if (t.attach) {
            const all = rosterFull();
            const row = x => `<div class="flex items-center gap-2 text-sm py-0.5"><label class="flex items-center gap-2 min-w-0 flex-1"><input type="checkbox" data-pick="${esc(tKey(x))}" ${S.picked[tKey(x)] !== false ? 'checked' : ''}>
                    <span class="font-bold text-slate-700">${esc(x.name)}</span><span class="text-xs text-slate-400 truncate">${x.extra ? '' : esc(x.school)}${x.fileNumber ? (x.extra ? '' : ' · ') + esc(x.fileNumber) : ''}</span></label>
                    ${x.extra ? `<button type="button" data-xrm="${esc(tKey(x))}" class="text-slate-400 hover:text-red-600 text-xs" aria-label="إزالة">&times;</button>` : ''}</div>`;
            const mineRows = all.filter(x => !x.extra), groups = new Map();
            all.filter(x => x.extra).forEach(x => { const k = norm(x.school); (groups.get(k) || groups.set(k, []).get(k)).push(x); });
            att.querySelector('#lettersRoster').innerHTML = !all.length
                ? `<p class="text-xs text-slate-400">${linked ? 'اختر مدرسةً من مدارسك في «مدارس الفئة المستهدفة»، أو أضف مدرسةً لمشرفٍ آخر من الأسفل.' : 'اربط رمزك بقاعدة المعلمين، أو أضف المعلّمين يدويّاً من الأسفل.'}</p>`
                : mineRows.map(row).join('')
                + [...groups.entries()].map(([k, xs]) => `<div class="mt-2 pt-2 border-t border-dashed border-slate-200">
                    <div class="flex items-center justify-between text-xs font-bold text-indigo-700 mb-1"><span>${esc(xs[0].school || 'مُضافون يدويّاً')}${xs[0].supervisor ? ' <span class="text-slate-400 font-normal">· المشرف: ' + esc(xs[0].supervisor) + '</span>' : ''}</span>
                    <button type="button" data-xschool="${esc(k)}" class="text-slate-400 hover:text-red-600 font-normal">إزالة المدرسة</button></div>${xs.map(row).join('')}</div>`).join('');
            if (!allState) loadAll(); else paintOthers();
        }

        const on = p => Object.keys(p.values).every(k => clean(f[k]) === clean(p.values[k]));
        box.querySelector('#lettersFields').innerHTML = (t.presets ? `<div class="flex flex-wrap gap-2">${t.presets.map((p, i) => `<button type="button" data-preset="${i}"
                class="text-xs font-bold rounded-lg px-3 py-1.5 border ${on(p) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}">${esc(p.label)}</button>`).join('')}</div>` : '')
            + t.fields.map(x => fieldHTML(t, x, f[x.id])).join('');
        renderPreview();
        renderLog();
    }

    function renderPreview() {
        const L = letter();
        document.getElementById('lettersSubject').textContent = L.subject;
        document.getElementById('lettersPreview').innerHTML = SvfLetters.letterHTML(L);
    }

    function renderLog() {
        const log = readJSON(LOG_KEY, []);
        const el = document.getElementById('lettersLog');
        el.innerHTML = log.length ? log.map((x, i) => `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
            <div class="min-w-0"><div class="text-sm font-bold text-slate-700 truncate">${esc(x.subject)}</div>
            <div class="text-[11px] text-slate-400"><bdi>${esc(String(x.at).slice(0, 10))}</bdi> · ${esc(x.how)}${x.schools && x.schools.length ? ' · ' + esc(x.schools.join('، ')) : ''}</div></div>
            <button type="button" data-log="${i}" class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1 font-bold flex-none">فتح</button></div>`).join('')
            : '<p class="text-xs text-slate-400">لا مراسلات بعد.</p>';
    }

    function logIt(how) {
        const L = letter();
        const log = readJSON(LOG_KEY, []);
        log.unshift({ at: new Date().toISOString(), how, subject: L.subject, tpl: S.tpl, schools: tpl().noRecipients ? [clean(fieldsOf(tpl()).school)].filter(Boolean) : S.schools.slice(),
            recipients: S.schools.slice(),
            fields: JSON.parse(JSON.stringify(fieldsOf(tpl()))), female: S.female, picked: Object.assign({}, S.picked), extra: (S.extra || []).slice() });
        writeJSON(LOG_KEY, log.slice(0, 50));
        renderLog();
    }

    // الخطاب منسَّقاً (HTML ونصّاً معاً): محرّر نظام المراسلات يلصق الكشف جدولاً لا أسطراً.
    // يُنسخ متزامناً داخل الضغطة (تحديد عنصرٍ ثمّ execCommand) قبل فتح التبويب — الحافظة غير المتزامنة تفشل حين يفقد المستند التركيز.
    function copyLetter(okMsg) {
        const L = letter(), html = SvfLetters.letterHTML(L, { paste: true }), text = SvfLetters.letterText(L);
        const box = document.createElement('div');
        box.setAttribute('dir', 'rtl'); box.contentEditable = 'true';
        box.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;opacity:0;';
        box.innerHTML = html;
        document.body.appendChild(box);
        const sel = window.getSelection(), r = document.createRange();
        r.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(r);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        sel.removeAllRanges(); box.remove();
        if (ok) { toast(okMsg); return; }
        if (navigator.clipboard && root.ClipboardItem) {
            navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
                .then(() => toast(okMsg), () => copy(text, 'نُسخ نصّاً بلا تنسيق — الكشف أسطرٌ لا جدول'));
        } else copy(text, 'نُسخ نصّاً بلا تنسيق — الكشف أسطرٌ لا جدول');
    }

    // لسكربت تامبر مانكي (v17.3): المراسلة في الصادر ثمّ حدثٌ يلتقطه فينقلها إلى تخزينه، فتظهر لوحة «تعبئة المراسلة»
    // في dms.moe.gov.om. بلا السكربت يبقى الصادر بلا أثر (يُكتب فوقه في المرّة التالية) والنسخ واللصق يكفيان.
    function queueDms() {
        const L = letter();
        writeJSON('svf_dms_outbox', { at: Date.now(), subject: L.subject, to: L.to,
            html: SvfLetters.letterHTML(L, { paste: true }), text: SvfLetters.letterText(L) });
        try { document.dispatchEvent(new CustomEvent('svf-dms-outbox')); } catch (e) {}
    }

    function copy(text, okMsg) {
        const done = () => toast(okMsg);
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('تعذّر النسخ', 'error'); }
        ta.remove();
    }

    function exportWord() {
        if (typeof htmlDocx === 'undefined') { toast('تعذّر تحميل مكتبة Word — تحقّق من الاتصال بالإنترنت', 'error'); return; }
        const L = letter();
        const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(L.subject)}</title></head><body dir="rtl">${SvfLetters.letterHTML(L)}</body></html>`;
        const blob = htmlDocx.asBlob(html, { orientation: 'portrait', margins: { top: 1440, bottom: 1080, left: 1080, right: 1080 } });
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = ('مراسلة - ' + L.subject).replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) + '.docx';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        logIt('Word'); toast('حُفظت المراسلة بصيغة Word');
    }

    function addSchool(v) {
        const s = clean(v);
        if (!s) return;
        if (S.schools.some(x => norm(x) === norm(s))) return;
        if (tpl().oneSchool) S.schools = [s]; else S.schools.push(s);
        saveState(); render();
    }

    function bind() {
        const box = document.getElementById('lettersApp');
        if (!box || box.dataset.bound) return;
        box.dataset.bound = '1';

        box.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.tpl) { S.tpl = b.dataset.tpl; saveState(); render(); }
            else if (b.dataset.rm != null) { S.schools.splice(+b.dataset.rm, 1); saveState(); render(); }
            else if (b.dataset.log != null) {
                const x = readJSON(LOG_KEY, [])[+b.dataset.log];
                if (!x) return;
                S.tpl = x.tpl; S.schools = x.recipients || x.schools || []; S.extra = x.extra || []; S.female = !!x.female; S.picked = x.picked || {};
                S.fields[x.tpl] = x.fields || {}; saveState(); render(); window.scrollTo(0, 0);
            }
            else if (b.dataset.preset != null) { Object.assign(fieldsOf(tpl()), tpl().presets[+b.dataset.preset].values); saveState(); render(); }
            else if (b.dataset.xrm != null) { S.extra = (S.extra || []).filter(x => tKey(x) !== b.dataset.xrm); delete S.picked[b.dataset.xrm]; saveState(); render(); }
            else if (b.id === 'lettersExtraAdd') {
                const i = box.querySelector('#lettersExtraInput');
                if (addSchoolTeachers(i.value)) i.value = '';
            }
            else if (b.dataset.xschool != null) {
                const k = b.dataset.xschool;
                (S.extra || []).filter(x => norm(x.school) === k).forEach(x => delete S.picked[tKey(x)]);
                S.extra = (S.extra || []).filter(x => norm(x.school) !== k); saveState(); render();
            }
            else if (b.id === 'lettersManualToggle') box.querySelector('#lettersManualForm').classList.toggle('hidden');
            else if (b.id === 'lettersManualAdd') {
                const g = id => box.querySelector(id);
                if (!clean(g('#lmName').value)) { toast('اكتب اسم المعلّم', 'error'); return; }
                if (addExtra({ name: g('#lmName').value, school: g('#lmSchool').value, fileNumber: g('#lmFile').value, gender: g('#lmGender').value }))
                    ['#lmName', '#lmSchool', '#lmFile'].forEach(id => { g(id).value = ''; });
            }
            else if (b.id === 'lettersFillBtn') fillFromVisit();
            else if (b.id === 'lettersAddSchool') { const i = box.querySelector('#lettersSchoolInput'); addSchool(i.value); i.value = ''; }
            else if (b.id === 'lettersCopy') { copyLetter('نُسخت المراسلة منسَّقةً (والكشف جدول)'); logIt('نسخ'); }
            else if (b.id === 'lettersCopySubject') copy(letter().subject, 'نُسخ الموضوع');
            else if (b.id === 'lettersWord') exportWord();
            else if (b.id === 'lettersDms') {
                // النسخ أوّلاً (متزامن، والمستند ما زال مركَّزاً) ثمّ الفتح — كلاهما داخل ضغطة المستخدم
                copyLetter('نُسخت المراسلة منسَّقة — الصقها في نظام المراسلات، والموضوع بزرّ «نسخ الموضوع»');
                queueDms();
                window.open(DMS_URL, '_blank', 'noopener');
                logIt('نظام المراسلات');
            }
            else if (b.id === 'lettersReset') {
                if (!confirm('مسح حقول هذا القالب والمخاطَبين؟')) return;
                delete S.fields[S.tpl]; S.schools = []; S.picked = {}; S.female = false; S.extra = []; saveState(); render();
            }
            else if (b.id === 'backToWelcomeFromLetters') { if (typeof root.showView === 'function') root.showView(document.getElementById('welcomeView')); }
        });

        box.addEventListener('input', e => {
            const el = e.target;
            if (el.dataset.f) { fieldsOf(tpl())[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; saveState(); renderPreview(); }
        });
        box.addEventListener('change', e => {
            const el = e.target;
            if (el.dataset.f && el.type === 'checkbox') { fieldsOf(tpl())[el.dataset.f] = el.checked; saveState(); renderPreview(); }
            else if (el.dataset.f === 'teacher') fillTeacher(el.value);
            else if (el.dataset.pick) { S.picked[el.dataset.pick] = el.checked; saveState(); renderPreview(); }
            else if (el.id === 'lettersFemale') { S.female = el.checked; saveState(); renderPreview(); }
            else if (el.id === 'lettersSchoolInput' && (ID() && ID().schoolNames ? ID().schoolNames() : []).some(s => norm(s) === norm(el.value))) { addSchool(el.value); el.value = ''; }
        });
        box.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.id === 'lettersSchoolInput') { e.preventDefault(); addSchool(e.target.value); e.target.value = ''; }
            if (e.key === 'Enter' && e.target.id === 'lettersExtraInput') { e.preventDefault(); if (addSchoolTeachers(e.target.value)) e.target.value = ''; }
        });
        document.addEventListener('svf-teachers-changed', () => { if (!box.classList.contains('hidden')) render(); });
    }

    root.svfLettersOpen = function () {
        if (!S) loadState();
        bind();
        render();
    };
})(typeof window !== 'undefined' ? window : this);
