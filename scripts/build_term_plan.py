# -*- coding: utf-8 -*-
"""الخطة الفصلية (Word) ← js/term-plan-data.js

    python scripts/build_term_plan.py "<مسار الخطة.docx>"

ملفّ الخطة اثنا عشر جدولاً بترتيب الصفوف (الأوّل ← الثاني عشر)، وأعمدة كلٍّ منها
بالترتيب: الملاحظات | عدد الحصص | الموضوع | الوحدات | التاريخ | الأسبوع | الشهر.
- الوحدة المدموجة رأسيّاً تُورَّث للصفوف تحتها (خليّتها فارغة فيها).
- التاريخ الفارغ يرث تاريخ الصفّ فوقه: أسابيع «يختار المعلم موضوعين أو ثلاثة»
  تذكر الموضوعات صفّاً صفّاً والتاريخ في أوّلها وحده.
- صفٌّ بتاريخٍ بلا موضوع يمدّ الموضوع الذي قبله (أسبوعٌ ثانٍ لموضوعٍ من عشر حصص).
- «ذكور» / «إناث» في الوحدة أو الموضوع ← جنس الصفّ.
- الموضوعان المفصولان بخطّ تطويل («…القصيرةــــــالاختبار العملي (1)») ← « / ».
"""
import io
import json
import re
import sys
import zipfile

AR_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')


def cell_text(tc):
    return ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', tc)).strip()


def clean_topic(t):
    t = re.sub('ـ{3,}', ' / ', t)          # خطّ التطويل بين موضوعين
    t = t.replace('ـ', '')
    return re.sub(r'\s+', ' ', t).strip(' -')


def gender_of(*texts):
    s = ' '.join(texts)
    if re.search(r'ذكور', s):
        return 'm'
    if re.search(r'[إا]ناث', s):
        return 'f'
    return ''


def parse_range(text, start_year):
    """«4/١٠ – 8/١٠» أو «25/١٠إلى10/١٢» ← ('2026-10-04', '2026-10-08')"""
    s = text.translate(AR_DIGITS)
    pairs = re.findall(r'(\d{1,2})\s*/\s*(\d{1,2})', s)
    if len(pairs) < 2:
        return None

    def iso(d, m):
        d, m = int(d), int(m)
        y = start_year if m >= 8 else start_year + 1
        return '%04d-%02d-%02d' % (y, m, d)
    return iso(*pairs[0]), iso(*pairs[1])


def build(path):
    z = zipfile.ZipFile(path)
    xml = z.read('word/document.xml').decode('utf8')
    years = re.search(r'\((\d{4})/(\d{4})', ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml)))
    start_year = int(years.group(1)) if years else 2026
    tables = re.findall(r'<w:tbl>.*?</w:tbl>', xml, flags=re.S)
    if len(tables) != 12:
        raise SystemExit('توقّعتُ ١٢ جدولاً (صفّاً لكلّ جدول) ووجدتُ %d' % len(tables))

    grades = {}
    for gi, tbl in enumerate(tables, start=1):
        rows = re.findall(r'<w:tr[ >].*?</w:tr>', tbl, flags=re.S)
        entries, unit, rng = [], '', None
        for tr in rows:
            cells = [cell_text(tc) for tc in re.findall(r'<w:tc>.*?</w:tc>', tr, flags=re.S)]
            if len(cells) < 7 or cells[2] == 'الموضوع':
                continue
            _, _, topic, unit_cell, date_cell, week, _ = cells[:7]
            if unit_cell and unit_cell != '-':
                unit = unit_cell
            if date_cell:
                r = parse_range(date_cell, start_year)
                if r:
                    rng = r
            topic = clean_topic(topic)
            if not rng:
                continue
            if not topic:
                # تاريخٌ بلا موضوع: امتدادٌ للموضوع السابق
                if date_cell and entries:
                    entries[-1]['to'] = max(entries[-1]['to'], rng[1])
                continue
            entries.append({
                'from': rng[0], 'to': rng[1], 'topic': topic,
                'unit': re.sub(r'\s+', ' ', unit).strip(),
                'gender': gender_of(unit, topic),
                'week': week.translate(AR_DIGITS).strip()
            })
        grades[str(gi)] = entries
    return {'year': '%d/%d' % (start_year, start_year + 1), 'term': 1, 'grades': grades}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    data = build(sys.argv[1])
    out = io.open('js/term-plan-data.js', 'w', encoding='utf8', newline='\n')
    out.write('// مولَّدٌ من الخطة الفصلية بـ scripts/build_term_plan.py — لا يُعدَّل يدوياً\n')
    out.write('window.SVF_TERM_PLAN = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    out.close()
    print('grades:', {g: len(e) for g, e in data['grades'].items()})
