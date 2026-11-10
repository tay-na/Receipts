-- Способ приготовления: 'духовка' | 'плита' | 'без готовки' | 'вафельница'
alter table recipes add column if not exists methods text[] not null default '{}';

-- проставить первой партии
update recipes r set methods = m.methods from (values
  ('tg:203403', array['вафельница']), ('tg:203406', array['плита']), ('tg:203409', array['плита']),
  ('tg:203416', array['плита']), ('tg:203430', array['плита']), ('tg:203422', array['плита']),
  ('tg:203424', array['плита']), ('tg:203426', array['плита']), ('tg:203427', array['плита']),
  ('tg:203652', array['плита']), ('tg:203657', array['плита']), ('tg:203658', array['плита']),
  ('tg:203659', array['плита']), ('tg:204635', array['духовка','плита']), ('tg:204223', array['духовка','плита']),
  ('tg:214439', array['плита']), ('tg:216234', array['духовка']), ('tg:300290', array['без готовки']),
  ('tg:203398', array['плита']), ('tg:203397', array['плита'])
) as m(id, methods) where r.imported_from = m.id;
