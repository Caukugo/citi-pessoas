import { useEffect, useState } from 'react';

/**
 * "Agora", que avança sozinho.
 *
 * POR QUE ISTO EXISTE: a agenda mostra estados que só o relógio determina —
 * "acontecendo agora" e "aguardando registro". Com um `new Date()` fixo no
 * primeiro render, um X1 das 15h continuaria "agendado" às 16h para quem
 * deixou a aba aberta, e só um F5 corrigiria.
 *
 * Um minuto é o passo certo: a agenda trabalha em granularidade de minuto, e
 * um intervalo mais curto seria re-render sem nada novo para mostrar.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
