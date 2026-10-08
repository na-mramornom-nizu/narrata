const test = require('node:test');
const assert = require('node:assert/strict');
const { hasContextQuote, hasNarrativeContext } = require('../lib/narrative-context.ts');

test('context evidence tolerates Russian inflection and typography', () => {
  assert.equal(hasContextQuote('В проекте «Аврора» завершены задачи. Остальные на ревью.', 'проект Аврора'), true);
  assert.equal(hasContextQuote('Среди пассажиров «Титаника» доли различались.', 'Титаник'), true);
  assert.equal(hasContextQuote('В опросе о «Звёздных войнах» ответы различались.', 'Звездные войны'), true);
  assert.equal(hasContextQuote('В каталоге растений указаны виды.', 'каталог растений'), true);
});

test('a quote absent from the opening sentence cannot certify context', () => {
  assert.equal(hasContextQuote('Выживаемость различалась по классам.', 'Титаник'), false);
  assert.equal(hasContextQuote('Показатели различались. На Титанике были пассажиры.', 'Титаник'), false);
  assert.equal(hasContextQuote('В проекте «Аврора» завершены задачи.', 'проект Орион'), false);
  assert.equal(hasContextQuote('В проекте «Аврора» завершены задачи.', ''), false);
});

test('source subject survives a paraphrased review without accepting absent context', () => {
  const narrative = 'Согласно данным о странах мира по ВВП, США лидируют. Китай занимает второе место.';
  const paraphrase = 'Соединённые Штаты Америки имеют самый высокий показатель по ВВП';
  assert.equal(hasNarrativeContext(narrative, paraphrase, 'Страны мира по ВВП'), true);
  assert.equal(hasNarrativeContext('Показатели отличаются. США лидируют.', paraphrase, 'Страны мира по ВВП'), false);
  assert.equal(hasNarrativeContext('Доли различаются по классам.', 'Пассажиры', 'Пассажиры Титаника'), false);
});
test('text context uses an explicit project name and ignores ordinary quoted statuses', () => {
  const { textContextSubject } = require('../lib/narrative-context.ts');
  assert.equal(textContextSubject('Отчёт команды разработки проекта «Аврора».'), 'Аврора');
  assert.equal(textContextSubject('Опрос “Звёздные войны”.'), 'Звёздные войны');
  assert.equal(textContextSubject('Задачи в статусе «Ревью».'), undefined);
});
