"use client";
/**
 * Widget anti-robô do Cloudflare Turnstile (ADR-0002 §2.8).
 *
 * Quem confere o token é o Supabase Auth (proteção por captcha do projeto),
 * não o nosso servidor: a API do Auth é pública, e só a verificação dentro
 * dele protege de verdade. O token vale uma vez; por isso o widget é
 * reiniciado a cada resposta do formulário (`rodada`).
 *
 * O widget grava o token num campo oculto `captchaToken` dentro do próprio
 * formulário (`response-field-name`), que a Server Action envia ao Auth em
 * `options.captchaToken`. Sem chave do site, a tela não mostra o widget.
 */
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SCRIPT_DO_TURNSTILE =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface OpcoesDoWidget {
  readonly sitekey: string;
  readonly "response-field-name": string;
  readonly language: string;
}

interface ApiDoTurnstile {
  render(alvo: HTMLElement, opcoes: OpcoesDoWidget): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

function api(): ApiDoTurnstile | undefined {
  return (window as unknown as { turnstile?: ApiDoTurnstile }).turnstile;
}

export function WidgetTurnstile({
  chaveDoSite,
  rodada,
}: {
  readonly chaveDoSite: string;
  readonly rodada: number;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const turnstile = api();
    const elemento = alvo.current;
    if (!carregado || turnstile === undefined || elemento === null) return;
    widget.current =
      turnstile.render(elemento, {
        sitekey: chaveDoSite,
        "response-field-name": "captchaToken",
        language: "pt-br",
      }) ?? null;
    return () => {
      if (widget.current !== null) turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [carregado, chaveDoSite]);

  useEffect(() => {
    if (rodada > 0 && widget.current !== null) api()?.reset(widget.current);
  }, [rodada]);

  return (
    <>
      <Script
        src={SCRIPT_DO_TURNSTILE}
        strategy="afterInteractive"
        onReady={() => {
          setCarregado(true);
        }}
      />
      <div ref={alvo} aria-label="Verificação contra robôs" />
    </>
  );
}
