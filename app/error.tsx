'use client';
import { AlertTriangle } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main className="mx-auto max-w-6xl px-5 pb-24 pt-12">
    <Card role="alert" className="mx-auto max-w-xl p-8 text-center">
      <AlertTriangle className="mx-auto mb-4 text-red-300" size={24}/>
      <h2 className="text-lg font-medium">Не удалось отобразить отчёт</h2>
      <p className="mt-2 text-sm text-white/50">Повторите открытие отчёта. Если ошибка повторяется, обновите страницу и загрузите исходный файл заново.</p>
      <Button className="mt-6" onClick={reset}>Повторить</Button>
    </Card>
  </main>;
}
