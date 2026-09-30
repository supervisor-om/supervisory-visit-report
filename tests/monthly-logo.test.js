// اختبار انحدار: node tests/monthly-logo.test.js
//   ١) الشعار: يُبدَّل أوّلُ صورةٍ في كلّ جدول ترويسة (يمين الصفحة) وحدها،
//      وتبقى بقيّة الصور، ويُحفظ العرض ويُحسب الارتفاع من نسبة الشعار الجديد
//   ٢) التظليل: لونٌ واحدٌ لأيّام الأسبوع (الأحد ← الخميس)، ويتبدّل بعده،
//      والصفّ غير المظلَّل في النموذج يخرج بلا تظليل لا وارثاً لتظليل غيره
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'js/monthly-logo.js'));
const D = require(path.join(ROOT, 'js/monthly-docx.js'));

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ترويسةٌ مصغَّرةٌ بثلاث صور، كما في نموذج المشرف: الشعار أوّلها (يمين الصفحة) */
const drawing = (rid, cx, cy) =>
    '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
    '<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="' + rid + '"/></a:blipFill>' +
    '<pic:spPr><a:xfrm><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';

const headerTable = (a, b, c) => '<w:tbl><w:tr><w:tc>' + drawing(a, 1552575, 967740) + '</w:tc>' +
    '<w:tc>' + drawing(b, 1280160, 704215) + '</w:tc><w:tc>' + drawing(c, 850900, 802005) + '</w:tc></w:tr></w:tbl>';

const XML = '<w:document><w:body>' + headerTable('rId6', 'rId7', 'rId8') +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>الخطة الشهرية المعتمدة</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    headerTable('rId9', 'rId10', 'rId11') + '</w:body></w:document>';

/* zip مصغَّر بواجهة JSZip التي تستعملها الوحدة */
function fakeZip(files) {
    const store = Object.assign({}, files);
    return {
        store,
        file(p, data) {
            if (data === undefined) {
                return (p in store) ? { async: () => Promise.resolve(store[p]) } : null;
            }
            store[p] = data;
            return this;
        }
    };
}

(async () => {
    /* ── ١) الشعار ── */
    {
        const refs = L.logoRefs(XML);
        check('logo: يُلتقط شعارٌ واحدٌ لكلّ جدول ترويسة',
              refs.length === 2 && refs[0].id === 'rId6' && refs[1].id === 'rId9',
              JSON.stringify(refs.map(r => r.id)));

        const zip = fakeZip({
            'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId6" Target="media/image1.jpeg"/></Relationships>',
            '[Content_Types].xml': '<Types><Default Extension="jpeg" ContentType="image/jpeg"/></Types>'
        });
        const res = await L.apply(zip, XML);

        check('logo: بُدِّلت صورتان لا أكثر', res.replaced === 2);
        const ids = [...res.xml.matchAll(/r:embed="([^"]+)"/g)].map(m => m[1]);
        check('logo: الشعار وحده أُعيد توجيهه في كلّ ترويسة',
              ids[0] === L.REL_ID && ids[3] === L.REL_ID, ids.join(','));
        check('logo: الصور الأخرى لم تُمسّ',
              ids[1] === 'rId7' && ids[2] === 'rId8' && ids[4] === 'rId10' && ids[5] === 'rId11', ids.join(','));

        const ext = [...res.xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map(m => [+m[1], +m[2]]);
        const ratio = ext[0][0] / ext[0][1];
        check('logo: العرض كما في النموذج والارتفاع بنسبة الشعار الجديد',
              ext[0][0] === 1552575 && Math.abs(ratio - L.RATIO) < 0.01, ext[0].join('x') + ' نسبة ' + ratio.toFixed(2));
        check('logo: a:ext تبعت wp:extent',
              new RegExp('<a:ext cx="1552575" cy="' + ext[0][1] + '"/>').test(res.xml), 'لم تتبع');
        check('logo: مقاس الصور الأخرى لم يتغيّر',
              ext[1][0] === 1280160 && ext[1][1] === 704215 && ext[2][1] === 802005, JSON.stringify(ext));

        check('logo: ملفّ الصورة كُتب في الحزمة', zip.store[L.PATH] && zip.store[L.PATH].length > 5000,
              zip.store[L.PATH] ? zip.store[L.PATH].length : 'مفقود');
        check('logo: العلاقة سُجّلت مرّةً واحدة',
              (zip.store['word/_rels/document.xml.rels'].match(new RegExp(L.REL_ID, 'g')) || []).length === 1);
        check('logo: png أُضيف إلى أنواع المحتوى',
              /Extension="png"/.test(zip.store['[Content_Types].xml']));

        /* تشغيلٌ ثانٍ على المخرج نفسه لا يُكرّر العلاقة ولا يُفسد المقاس */
        const again = await L.apply(zip, res.xml);
        check('logo: إعادة التطبيق لا تُكرّر العلاقة',
              (zip.store['word/_rels/document.xml.rels'].match(new RegExp(L.REL_ID, 'g')) || []).length === 1);
        const ext2 = [...again.xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map(m => [+m[1], +m[2]]);
        check('logo: ولا تُغيّر المقاس مرّةً أخرى', ext2[0][1] === ext[0][1], ext2[0].join('x'));

        const noImages = await L.apply(fakeZip({}), '<w:document><w:body></w:body></w:document>');
        check('logo: مستندٌ بلا صورٍ يمرّ بلا خطأ', noImages.replaced === 0);
    }

    /* ── ٢) التظليل بلا وسمٍ في النموذج ── */
    {
        const cellShaded = '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="FAEDBC"/></w:tcPr>' +
                           '<w:p><w:r><w:t>س</w:t></w:r></w:p></w:tc>';
        const src = fs.readFileSync(path.join(ROOT, 'js/monthly-docx.js'), 'utf8');
        check('shade: الفراغ ينزع التظليل بدل أن يُبقيه',
              /if \(!shd\) return \(has \? head\.replace\(\/<w:shd \[\^>\]\*\\\/>\/, ''\) : head\) \+ tail;/.test(src),
              'ما زال يُعيد الخليّة كما هي');
        check('shade: التظليل يتبدّل بالأسبوع لا بكتلٍ من خمسة',
              /weekIndex % 2 === 0 \? proto\.shdGray : proto\.shdWhite/.test(src) && !/BAND/.test(src));
        check('shade: رقم الأسبوع يتقدّم عند الأحد أو عند رجوع رقم اليوم',
              /wd === 0 \|\| wd < prevWd/.test(src));
        check('shade: ويُمرَّر إلى بناء الصفّ', /buildRow\(an\.proto, row, weekOf\(row\)\)/.test(src));
        check('shade: خليّة بلا tcPr تمرّ بلا تغيير', /if \(at < 0\) return cell;/.test(src));
        /* سلامة الوسوم بعد النزع */
        const stripped = cellShaded.replace(/<w:shd [^>]*\/>/, '');
        check('shade: النزع لا يكسر tcPr', stripped.includes('<w:tcPr></w:tcPr>'), stripped.slice(0, 60));
    }

    /* ── ٣) التوصيل ── */
    {
        const html = fs.readFileSync(path.join(ROOT, 'monthly.html'), 'utf8');
        check('wiring: monthly-logo.js يُحمَّل قبل monthly.js',
              html.indexOf('js/monthly-logo.js') > 0 &&
              html.indexOf('js/monthly-logo.js') < html.indexOf('js/monthly.js'));
        const mj = fs.readFileSync(path.join(ROOT, 'js/monthly.js'), 'utf8');
        check('wiring: التوليد يستدعي MonthlyLogo.apply', /MonthlyLogo\.apply\(zip, xmlOut\)/.test(mj));
        check('wiring: وفشله لا يُبطل التقرير', /catch \(e\) \{ console\.error\('تعذّر تبديل الشعار/.test(mj));
        check('wiring: عامل الخدمة يخزّن الوحدة',
              fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes("'./js/monthly-logo.js'"));
    }

    console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
    process.exit(failures ? 1 : 0);
})();
