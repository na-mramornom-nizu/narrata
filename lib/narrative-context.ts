export function textContextSubject(source: string): string | undefined {
  // Only explicit source names qualify as an independent context anchor.
  // A quoted status or an invented event name must not certify the narrative.
  const named = source.match(/(?:проект[а-яё]*|компани[а-яё]*|опрос[а-яё]*|событи[а-яё]*|продукт[а-яё]*|команд[а-яё]*)\s+[«“"]([^»”"\n]{1,120})[»”"]/iu);
  return named?.[1].trim();
}

export function includeTextContext(narrative: string, source: string): string {
  const subject=textContextSubject(source);
  if(!subject || hasContextQuote(narrative,subject))return narrative;
  const named=source.match(/(проект[а-яё]*|компани[а-яё]*|опрос[а-яё]*|событи[а-яё]*|продукт[а-яё]*|команд[а-яё]*)\s+[«“"]/iu)?.[1].toLowerCase()??'';
  const intro=named.startsWith('проект')?'В проекте':named.startsWith('компани')?'В компании':named.startsWith('опрос')?'В опросе':named.startsWith('команд')?'В команде':named.startsWith('продукт')?'В данных о продукте':'В данных о событии';
  const sentence=narrative.replace(/^(На|За|Всего|В|Из|По|К|Число|Количество|Доля|Команда|Компания|Проект|Среди|Около|Согласно)(?=\s)/u,word=>word.toLowerCase());
  return `${intro} «${subject}» ${sentence}`;
}

// The reviewer may return the nominative form of a name used in another case.
// Match consecutive words, tolerating only short inflectional endings.
export function hasContextQuote(narrative: string, quote: string): boolean {
  const words = (text: string) => text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
  const sentence = words(narrative.split(/(?<=[.!?])\s+/)[0]);
  const reference = words(quote);
  return reference.length > 0 && sentence.some((_, start) => reference.every((word, offset) => {
    const actual = sentence[start + offset];
    if (!actual) return false;
    if (actual === word) return true;
    if (!/^[а-я]+$/.test(word) || !/^[а-я]+$/.test(actual)) return false;
    const stemLength = Math.max(4, Math.max(word.length, actual.length) - 2);
    return word.length >= stemLength && actual.length >= stemLength && word.slice(0, stemLength) === actual.slice(0, stemLength);
  }));
}

export function hasNarrativeContext(narrative: string, reviewQuote: string, subject?: string): boolean {
  // A reviewer's paraphrase is not a verbatim quote. The source subject is an
  // independent anchor, so valid prose need not fail because of that paraphrase.
  return hasContextQuote(narrative, reviewQuote) || (!!subject && hasContextQuote(narrative, subject));
}
