# Фото из экспорта чата -> docs/media/*.webp (+ миниатюры) и SQL для recipe_media.
# python3 media_sql.py batch02.json <папка photos экспорта> ../supabase/seed_media_batch02.sql
import json, sys, subprocess, os
B = json.load(open(sys.argv[1])); src = sys.argv[2]; docs = os.path.join(os.path.dirname(__file__), '..', 'docs')
sql = ['begin;']
for r in B:
    ids = r.get('media', [])
    if not ids: continue
    rid = r['imported_from']
    sql.append(f"delete from recipe_media where recipe_id=(select id from recipes where imported_from='{rid}');")
    for n, i in enumerate(ids):
        name = f"media/{rid.replace(':', '-')}-{n}.webp"
        f = f'{src}/photo_{i}_0.jpg' if i.isdigit() else os.path.join(src, i)
        subprocess.run(['convert', f, '-resize', '900x1200>', '-strip', '-quality', '72', f'{docs}/{name}'], check=True)
        subprocess.run(['convert', f, '-resize', '160x160^', '-gravity', 'center', '-extent', '160x160', '-strip', '-quality', '65',
                        f"{docs}/{name.replace('.webp', '-t.webp')}"], check=True)
        sql.append(f"insert into recipe_media(recipe_id,position,kind,path) select id,{n},'{'cover' if n == 0 else 'photo'}','{name}' "
                   f"from recipes where imported_from='{rid}';")
sql.append('commit;')
open(sys.argv[3], 'w').write('\n'.join(sql)); print(len(sql) - 2, 'statements ->', sys.argv[3])
