import json, sys, base64, subprocess, html
B=json.load(open(sys.argv[1])); root=sys.argv[2]
def img(p):
    out=subprocess.run(['convert',f'{root}/{p}','-resize','600x600>','-quality','70','jpg:-'],capture_output=True).stdout
    return 'data:image/jpeg;base64,'+base64.b64encode(out).decode()
def fmt(n):
    return ('%g'%n).replace('.',',') if n is not None else ''
SRC={'instagram':'Instagram','telegram':'Телеграм','site':'Сайт','book':'Книга','magazine':'Журнал','pdf':'PDF','own':'Свой','other':'Пост в чате','app':'Приложение'}
LANG={'en':'перевод с английского','sr':'перевод с сербского'}
e=html.escape; cards=[]
for r in B:
    secs={}
    for i in r['ingredients']: secs.setdefault(i['section'],[]).append(i)
    ing=''
    for s,items in secs.items():
        if s: ing+=f'<h4>{e(s)}</h4>'
        ing+='<ul class="ing">'
        groups=[]
        for i in items:
            if i['alt_group'] and groups and groups[-1][0]['alt_group']==i['alt_group']: groups[-1].append(i)
            else: groups.append([i])
        def qty(i):
            q=fmt(i['amount'])+('–'+fmt(i['amount_max']) if i['amount_max'] else '')
            q=(q+' '+(i['unit'] or '')).strip()
            return e(q)+(f' <span class="g">≈ {fmt(i["grams"])} г</span>' if i['grams'] else '')
        for g in groups:
            qs=[qty(i) for i in g]; same=len(set(qs))==1
            names=[]
            for k,i in enumerate(g):
                t='<span class="t">по желанию</span>' if i['optional'] and k==0 else ''
                note=f'<div class="n">{e(i["note"])}</div>' if i['note'] else ''
                raw=f'<div class="n">ориг.: {e(i["raw"])}</div>' if i['raw'] and r['original_lang']!='ru' else ''
                own='' if same else f' <span class="q2">{qs[k]}</span>'
                names.append(f'<span class="nm">{e(i["name"])}</span>{own}{t}{note}{raw}')
            ing+='<li><div>'+'<div class="or">или</div>'.join(names)+'</div><div class="q">'+(qs[0] if same else '')+'</div></li>'
        ing+='</ul>'
    st=''; cur=object()
    if r['steps']:
        st='<h3>Как готовить</h3>'
        for s in r['steps']:
            if s['section']!=cur and s['section']: st+=f'<h4>{e(s["section"])}</h4>'
            cur=s['section']; st+=f'<p class="st">{e(s["text"])}</p>'
    meta=[SRC.get(r['source_type'],'')]
    if r['source_author']: meta.append(e(r['source_author']))
    if r['source_ref']: meta.append(e(r['source_ref']))
    if r['original_lang'] in LANG: meta.append(LANG[r['original_lang']])
    y=[]
    if r['yield_amount']: y.append(f"{fmt(r['yield_amount'])} {r['yield_unit']}")
    if r['time_min']: y.append(f"{r['time_min']} мин")
    pics=''.join(f'<img src="{img(p)}">' for p in r['media'][:3])
    kind='<span class="kind">идея</span>' if r['kind']=='idea' else ''
    cards.append(f'''<article>{f'<div class="pics">{pics}</div>' if pics else ''}<div class="body">
<h2>{e(r["title"])} {kind}</h2><div class="meta">{' · '.join(m for m in meta if m)}{' · '+' · '.join(y) if y else ''}</div>
{f'<p class="sum">{e(r["summary"])}</p>' if r['summary'] else ''}<h3>Ингредиенты</h3>{ing}{st}
<div class="tg">{''.join(f'<span>#{e(t)}</span>' for t in r['tags'])}<span class="id">{r['imported_from']}</span></div></div></article>''')
page=f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Карточки рецептов</title><style>
:root{{--bg:#f6f3ee;--card:#fff;--ink:#2b2622;--mute:#8a8077;--line:#e8e1d8;--acc:#b5532c;--chip:#f1ebe3}}
@media (prefers-color-scheme:dark){{:root{{--bg:#1b1917;--card:#24211e;--ink:#eee7df;--mute:#9b9087;--line:#38332e;--acc:#e08a62;--chip:#2f2b27}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,system-ui,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:16px}} header h1{{font-size:22px;margin:8px 0 4px}} header p{{color:var(--mute);margin:0 0 16px}}
article{{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:0 0 18px;overflow:hidden}}
.pics{{display:flex;gap:2px;overflow-x:auto;background:var(--line)}} .pics img{{height:220px;object-fit:cover;flex:0 0 auto;max-width:100%}}
.body{{padding:14px 16px 12px}} h2{{font-size:19px;margin:0 0 4px}} .kind{{font-size:12px;background:var(--acc);color:#fff;border-radius:6px;padding:1px 7px;vertical-align:middle}}
.meta{{color:var(--mute);font-size:13px}} .sum{{margin:8px 0 0;font-style:italic}}
h3{{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--acc);margin:14px 0 6px}} h4{{margin:10px 0 4px;font-size:14px}}
.ing{{list-style:none;margin:0;padding:0}} .ing li{{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:6px 0;border-bottom:1px dashed var(--line)}}
.q{{text-align:right;white-space:nowrap}} .g{{color:var(--mute);font-size:12px}} .or{{font-size:12px;color:var(--acc);margin:1px 0}} .q2{{color:var(--mute);font-size:13px}}
.b{{font-size:11px;color:var(--mute);background:var(--chip);border-radius:5px;padding:0 6px}}
.n{{font-size:12px;color:var(--mute)}} .t{{font-size:11px;border:1px solid var(--line);border-radius:5px;padding:0 5px;margin-left:6px;color:var(--mute)}} .alt{{color:var(--acc);border-color:var(--acc)}}
.st{{margin:4px 0;padding-left:12px;border-left:2px solid var(--line)}} .tg{{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:var(--mute)}} .id{{margin-left:auto;opacity:.6}}
</style></head><body><main><header><h1>Карточки рецептов — партия 1</h1>
<p>{len(B)} рецептов из Телеграм-чата. «≈ г» — пересчёт из ложек.</p></header>
{''.join(cards)}</main></body></html>'''
open(sys.argv[3],'w').write(page); print(len(page)//1024,'KB')
