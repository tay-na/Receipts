# Превращает batch*.json в SQL для вставки в Supabase (SQL Editor).
# Рецепты попадают в дом с названием 'Наш дом' (создаётся, если его нет).
import json, sys
def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, list): return "array[" + ",".join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"
B = json.load(open(sys.argv[1])); out = ["begin;",
 "insert into households(name) select 'Наш дом' where not exists (select 1 from households where name='Наш дом');"]
for r in B:
    cols = ['kind','title','summary','yield_amount','yield_unit','time_min','status','tags','source_type',
            'source_author','source_url','source_ref','original_lang','imported_from']
    out.append(f"delete from recipes where imported_from={q(r['imported_from'])};")
    out.append("insert into recipes(household_id," + ",".join(cols) + ") select h.id,"
               + ",".join(q(r[c]) for c in cols) + " from households h where h.name='Наш дом' limit 1;")
    parts = []
    for n, i in enumerate(r['ingredients']):
        parts.append(f"insert into recipe_ingredients(recipe_id,position,section,name,base,amount,amount_max,unit,grams,approx,optional,alt_group,note,raw) select r.id,{n},{q(i['section'])},{q(i['name'])},{q(i['base'])},{q(i['amount'])},{q(i['amount_max'])},{q(i['unit'])},{q(i['grams'])},{q(i['approx'])},{q(i['optional'])},{q(i['alt_group'])},{q(i['note'])},{q(i['raw'])} from r")
    for n, s in enumerate(r['steps']):
        parts.append(f"insert into recipe_steps(recipe_id,position,section,text) select r.id,{n},{q(s['section'])},{q(s['text'])} from r")
    rid = f"(select id from recipes where imported_from={q(r['imported_from'])})"
    for p in parts:
        out.append(p.replace(" from r", "").replace("select r.id", f"select {rid}") + ";")
out.append("commit;")
open(sys.argv[2], 'w').write("\n".join(out)); print(len(B), 'recipes ->', sys.argv[2])
