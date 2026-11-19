import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

/** Une clases, ignorando valores vacíos. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const BUTTON_BASE =
  "inline-flex min-h-13 items-center justify-center gap-2 rounded-lg px-6 py-3 text-[1.0625rem] font-bold leading-tight " +
  "transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-signal text-ink hover:bg-paper disabled:hover:bg-signal",
  secondary: "border-2 border-paper/80 text-paper hover:bg-paper hover:text-ink disabled:hover:bg-transparent disabled:hover:text-paper",
  quiet: "text-paper underline decoration-paper/40 underline-offset-4 hover:decoration-paper min-h-11 px-3",
  danger: "border-2 border-signal text-signal hover:bg-signal hover:text-ink",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

type NoticeTone = "info" | "ok" | "warn" | "error";

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: "border-line bg-coal text-paper",
  ok: "border-ok/50 bg-ok-deep text-paper",
  warn: "border-warn/60 bg-warn-deep text-paper",
  error: "border-signal/70 bg-signal-deep text-paper",
};

const NOTICE_MARK: Record<NoticeTone, string> = { info: "i", ok: "✓", warn: "!", error: "×" };
const NOTICE_MARK_TONE: Record<NoticeTone, string> = {
  info: "bg-line text-paper",
  ok: "bg-ok text-ink",
  warn: "bg-warn text-ink",
  error: "bg-signal text-ink",
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  /** `alert` interrumpe al lector de pantalla; `status` espera su turno. */
  role?: "alert" | "status";
  className?: string;
  testId?: string;
}

export function Notice({ tone = "info", title, children, role, className, testId }: NoticeProps) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={cx("flex gap-3 rounded-lg border p-4 text-base", NOTICE_TONES[tone], className)}
    >
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold",
          NOTICE_MARK_TONE[tone],
        )}
      >
        {NOTICE_MARK[tone]}
      </span>
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-bold leading-snug">{title}</p> : null}
        {children ? <div className="leading-snug text-paper/90">{children}</div> : null}
      </div>
    </div>
  );
}

export const STEP_NAMES = ["Portada", "Consentimiento", "Foto", "Animación", "Resultado"] as const;

interface StepShellProps {
  /** Número de paso, de 1 a 5. */
  step: number;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  wide?: boolean;
}

/** Marco común de los pasos 2 a 5: progreso, título y contenido. */
export function StepShell({ step, title, lead, children, headingRef, wide }: StepShellProps) {
  return (
    <section
      className={cx("mx-auto w-full animate-rise px-5 pb-6 pt-8 sm:px-8 sm:pt-12", wide ? "max-w-5xl" : "max-w-2xl")}
      aria-labelledby={`paso-${step}-titulo`}
    >
      <div className="mb-6">
        <p className="label text-ash">
          Paso {step} de {STEP_NAMES.length} · <span className="text-paper">{STEP_NAMES[step - 1]}</span>
        </p>
        <ol className="mt-3 flex gap-1.5" aria-hidden="true">
          {STEP_NAMES.map((name, index) => (
            <li
              key={name}
              className={cx("h-1 flex-1 rounded-full", index < step ? "bg-signal" : "bg-line")}
            />
          ))}
        </ol>
      </div>
      <h1
        id={`paso-${step}-titulo`}
        ref={headingRef}
        tabIndex={-1}
        className="display text-[2.35rem] sm:text-5xl"
      >
        {title}
      </h1>
      {lead ? <div className="mt-3 max-w-xl text-lg text-ash">{lead}</div> : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}
