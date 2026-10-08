const test = require('node:test');
const assert = require('node:assert/strict');
const { hasContextQuote } = require('../lib/narrative-context.ts');

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
