# Общие помощники для файлов batchNN.py
def I(name, base, amount=None, unit=None, *, mx=None, grams=None, approx=False,
      opt=False, alt=None, note=None, raw=None, sec=None):
    """Ингредиент. name — как видят люди (категория первой: «сыр тильзитер»), base — скрытая категория для поиска и стока."""
    return dict(section=sec, name=name, base=base, amount=amount, amount_max=mx, unit=unit,
                grams=grams, approx=approx or grams is not None, optional=opt,
                alt_group=alt, note=note, raw=raw)

def S(text, sec=None):
    return dict(section=sec, text=text)

def R(**kw):
    """Рецепт. category: раздел меню (см. CATEGORIES). methods: 'духовка' | 'плита' | 'без готовки' | 'вафельница'. media: id фото из экспорта чата."""
    d = dict(kind='recipe', summary=None, yield_amount=None, yield_unit=None, time_min=None,
             status='want', category=None, tags=[], methods=[], notes=None, source_type=None, source_author=None,
             source_url=None, source_ref=None, original_lang='ru', imported_from=None, media=[], steps=[])
    d.update(kw)
    return d

CATEGORIES = ['Завтраки', 'Супы', 'Салаты', 'Горячее', 'Закуски и бутерброды', 'Выпечка', 'Десерты', 'Соусы и намазки', 'Напитки']
