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
