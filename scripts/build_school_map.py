# -*- coding: utf-8 -*-
"""مسح البوّابة + مدارس قاعدة المعلّمين ← school-map.json (دليل المدارس الموحّد)

    python scripts/build_school_map.py --scan school-scan.json --db db_schools.json

  --scan    الملفّ الذي نزّله زرّ «🏫 مسح مدارس البوابة» في السكربت (v16.7)
  --db      أسماء المدارس في قاعدة المعلّمين: { "اسم المدرسة": {"n": عدد, "type": "خاصة"} }
            (يُستخرج من Firestore — انظر CLAUDE.md)
  --aliases school-aliases.json (اختياريّ): بدائل مؤكَّدة { "اسم القاعدة": "اسم البوّابة الحرفيّ" }

المخرجات:
  school-map.json              الدليل الذي يجلبه السكربت (المدارس بأنظمتها + البدائل المؤكَّدة)
  school-map-review.md         ما يحتاج تأكيد المشرف: الملتبس، وما لا مطابقة له مع أقرب المرشّحين
  school-aliases.proposed.json مقترحاتٌ قويّة — **لا تُطبَّق** حتّى تُنقل إلى school-aliases.json

القاعدة: لا تخمين في سجلٍّ رسميّ. «تلقائيّ» = ما يجده السكربت بقواعده نفسها (matchSchool)؛
وغيره بديلٌ يؤكّده إنسان.
"""
import argparse
import difflib
import io
import json
import re

STOP = ['مدرسه', 'المدرسه', 'مدارس', 'المدارس', 'الخاصه', 'خاصه', 'الدوليه', 'دوليه',
        'للتعليم', 'التعليم', 'الاساسي', 'الاساسيه', 'العام', 'ما', 'بعد',
        'ثنائيه', 'اللغه', 'ثنائي', 'في', 'من']


def norm_edu(v):
    """نسخة normEdu في السكربت حرفاً بحرف"""
    s = str(v or '')
    s = re.sub('[ـً-ْ]', '', s)
    s = re.sub('[أإآ]', 'ا', s).replace('ة', 'ه').replace('ى', 'ي')
    s = re.sub(r'[()\-–_.,،:/\\]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def match_school(options, school_name):
    """نسخة matchSchool: يعيد (الخيار الوحيد أو None، قائمة الملتبس)"""
    n = norm_edu(school_name)
    opts = [o for o in options if len(norm_edu(o['portal'])) >= 3]
    nt = lambda o: norm_edu(o['portal'])
    head = lambda o: norm_edu(re.split(r'\s+-\s+', o['portal'])[0])
    exact = [o for o in opts if nt(o) == n or head(o) == n]
    if len(exact) == 1:
        return exact[0], []
    if len(exact) > 1:
        return None, exact
    if len(n) < 4:
        return None, []
    contains = [o for o in opts if n in nt(o) or (len(head(o)) >= 6 and head(o) in n)]
    if len(contains) == 1:
        return contains[0], []
    if len(contains) > 1:
        return None, contains
    is_num = lambda t: re.fullmatch(r'\d+', t) is not None
    nums = [t for t in n.split(' ') if is_num(t)]
    tokens = [t for t in n.split(' ') if not is_num(t) and len(t) >= 2 and t not in STOP]
    if not tokens:
        return None, []
    hits = []
    for o in opts:
        words = nt(o).split(' ')
        if not all(t in words for t in tokens):
            continue
        if nums and not all(d in nums for d in words if is_num(d)):
            continue
        hits.append(o)
    if len(hits) == 1:
        return hits[0], []
    return None, hits


def core_tokens(name):
    """كلمات الاسم المميِّزة لتقدير القرب: بلا «ال» ولا الكلمات العامّة ولا الأرقام"""
    out = []
    for t in norm_edu(name).lower().split(' '):
        if not t or re.fullmatch(r'\d+', t) or t in STOP:
            continue
        out.append(t[2:] if t.startswith('ال') and len(t) > 4 else t)
    return out


def score(a, b):
    ta, tb = set(core_tokens(a)), set(core_tokens(b))
    if not ta or not tb:
        return 0.0
    overlap = len(ta & tb) / max(len(ta), len(tb))
    ratio = difflib.SequenceMatcher(None, ' '.join(sorted(ta)), ' '.join(sorted(tb))).ratio()
    return round(0.6 * overlap + 0.4 * ratio, 3)


def build(scan, db, aliases):
    schools = [s for s in scan.get('schools', []) if s.get('portal')]
    if not schools:
        raise SystemExit('ملفّ المسح بلا مدارس')
    by_portal = {norm_edu(s['portal']): s for s in schools}

    auto, ambiguous, unmatched, aliased = [], [], [], []
    proposed = {}
    for name in sorted(db, key=lambda x: norm_edu(x)):
        if name in aliases:
            target = norm_edu(aliases[name])
            if target in by_portal:
                aliased.append((name, by_portal[target]))
                continue
            unmatched.append((name, [], 'البديل المؤكَّد يشير لاسمٍ ليس في المسح: ' + aliases[name]))
            continue
        hit, amb = match_school(schools, name)
        if hit:
            auto.append((name, hit))
        elif amb:
            ambiguous.append((name, amb))
        else:
            cands = sorted(schools, key=lambda s: -score(name, s['portal']))[:3]
            cands = [(c, score(name, c['portal'])) for c in cands]
            unmatched.append((name, cands, ''))
            if cands and cands[0][1] >= 0.75 and (len(cands) < 2 or cands[0][1] - cands[1][1] >= 0.15):
                proposed[name] = cands[0][0]['portal']

    alias_map = {}
    for name, s in aliased:
        alias_map[norm_edu(name).lower()] = s['portal']
    out = {
        'version': 1,
        'scannedAt': scan.get('scannedAt', ''),
        'schools': [{'portal': s['portal'], 'system': s.get('system', '')} for s in schools],
        'aliases': alias_map
    }
    return out, auto, ambiguous, unmatched, aliased, proposed


def review_md(db, auto, ambiguous, unmatched, aliased, proposed):
    L = ['# مراجعة دليل المدارس', '',
         '| | العدد |', '|---|---|',
         '| يجدها السكربت تلقائياً | %d |' % len(auto),
         '| ببديلٍ مؤكَّد | %d |' % len(aliased),
         '| ملتبسة (أكثر من مدرسة) | %d |' % len(ambiguous),
         '| بلا مطابقة | %d |' % len(unmatched),
         '| مقترحاتٌ قويّة (تحتاج تأكيداً) | %d |' % len(proposed), '']
    if ambiguous:
        L += ['## ملتبسة — أيّها المقصودة؟', '']
        for name, amb in ambiguous:
            L.append('- **%s** (%s معلّماً): %s' % (name, db[name].get('n', '?'),
                     ' / '.join('%s [%s]' % (a['portal'], a.get('system', '')) for a in amb[:6])))
        L.append('')
    if unmatched:
        L += ['## بلا مطابقة — أقرب ما في البوّابة', '']
        for name, cands, note in unmatched:
            if note:
                L.append('- **%s**: %s' % (name, note))
                continue
            c = ' / '.join('%s [%s] (%.2f)' % (x['portal'], x.get('system', ''), sc) for x, sc in cands) or '—'
            mark = ' ⭐ مقترح' if name in proposed else ''
            L.append('- **%s** (%s معلّماً)%s: %s' % (name, db[name].get('n', '?'), mark, c))
        L.append('')
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', required=True)
    ap.add_argument('--db', required=True)
    ap.add_argument('--aliases', default='school-aliases.json')
    ap.add_argument('--out', default='school-map.json')
    a = ap.parse_args()
    scan = json.load(io.open(a.scan, encoding='utf8'))
    db = json.load(io.open(a.db, encoding='utf8'))
    try:
        aliases = json.load(io.open(a.aliases, encoding='utf8'))
    except FileNotFoundError:
        aliases = {}
    out, auto, amb, unm, ali, prop = build(scan, db, aliases)
    io.open(a.out, 'w', encoding='utf8', newline='\n').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    io.open('school-map-review.md', 'w', encoding='utf8', newline='\n').write(review_md(db, auto, amb, unm, ali, prop))
    io.open('school-aliases.proposed.json', 'w', encoding='utf8', newline='\n').write(
        json.dumps(prop, ensure_ascii=False, indent=1) + '\n')
    print('مدارس البوّابة: %d | تلقائيّ: %d | بديل: %d | ملتبس: %d | بلا مطابقة: %d | مقترح: %d'
          % (len(out['schools']), len(auto), len(ali), len(amb), len(unm), len(prop)))
