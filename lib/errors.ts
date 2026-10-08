export function serviceError(error: unknown, operation: 'analysis' | 'chat'): { error: string; status: number } {
  const message = error instanceof Error ? error.message : '';
  if (/timeout|timed out|abort|не ответил за/i.test(message)) return { error: 'Сервис анализа не успел ответить. Данные сохранены на странице — повторите запрос через минуту.', status: 504 };
  if (/401|403|auth|credential/i.test(message)) return { error: 'Сервис ИИ недоступен: требуется проверить его подключение. Обратитесь к администратору приложения.', status: 503 };
  if (/429|rate.?limit/i.test(message)) return { error: 'Сервис ИИ сейчас перегружен. Подождите минуту и повторите запрос.', status: 503 };
  return { error: operation === 'analysis'
    ? 'ИИ не смог подготовить надежный анализ этого файла. Повторите анализ; если ошибка повторится, попробуйте загрузить меньшую таблицу.'
    : 'Не удалось получить ответ от ИИ. Ваш вопрос сохранен в чате. Попробуйте отправить его еще раз.', status: 502 };
}
